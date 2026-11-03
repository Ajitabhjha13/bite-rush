const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const MenuItem = require('../models/MenuItem');
const Combo = require('../models/Combo');
const { parsePagination, pageResult } = require('../utils/paginate');
const limits = require('../config/limits');
const { DELIVERY_CITY } = require('../config/delivery');
const rules = require('../config/orderPayment');
const ops = require('../services/orderPaymentService');
const events = require('../services/orderEvents');
const User = require('../models/User');

// @route   POST /api/orders
// @desc    Place a new order (customer)
const placeOrder = async (req, res) => {
  try {
    const { cart_items, delivery: d } = req.body; // [{ type: 'item'|'combo', item_id/combo_id, quantity }, ...]
    const online = req.body.payment_method === 'online'; // anything else is cash on delivery

    if (!cart_items || cart_items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    if (online) await ops.expireStale();

    let total = 0;
    const validatedItems = [];

    for (const cartItem of cart_items) {
      const quantity = cartItem.quantity || 1;

      if (cartItem.type === 'combo') {
        const combo = await Combo.findById(cartItem.combo_id);

        if (!combo) {
          return res.status(400).json({ message: `Combo ${cartItem.combo_id} not found` });
        }

        if (!combo.is_available) {
          return res.status(400).json({ message: `${combo.name} is currently unavailable` });
        }

        total += combo.combo_price * quantity;

        validatedItems.push({
          combo: combo._id,
          quantity,
          unit_price: combo.combo_price
        });

      } else {
        const menuItem = await MenuItem.findById(cartItem.item_id);

        if (!menuItem) {
          return res.status(400).json({ message: `Menu item ${cartItem.item_id} not found` });
        }

        if (!menuItem.is_available) {
          return res.status(400).json({ message: `${menuItem.name} is currently unavailable` });
        }

        total += menuItem.price * quantity;

        // Only store a spice level if the dish actually supports it - ignore
        // anything sent for items that don't (defensive, matches server-side
        // validation philosophy used elsewhere in this project).
        const spiceLevel = menuItem.has_spice_level && cartItem.spice_level
          ? cartItem.spice_level
          : null;

        validatedItems.push({
          item: menuItem._id,
          quantity,
          unit_price: menuItem.price,
          spice_level: spiceLevel
        });
      }
    }

    // Create the order
    const order = await Order.create({
      user: req.user._id,
      total_amount: total,
      status: 'Received',
      // Copy only the known fields (already validated and trimmed); the city is ours, not the client's.
      delivery: {
        name: d.name,
        phone: d.phone,
        address_line: d.address_line,
        area: d.area,
        landmark: d.landmark || '',
        pincode: d.pincode,
        city: DELIVERY_CITY
      },
      payment_method: online ? 'online' : 'cod',
      // An online order is not real until Razorpay confirms the payment. Until then it stays hidden.
      payment_status: online ? 'pending' : 'none',
      pay_by: online ? new Date(Date.now() + rules.PENDING_MINUTES * 60 * 1000) : null
    });

    // Create order items linked to this order
    const orderItemsToCreate = validatedItems.map((item) => ({
      order: order._id,
      ...item
    }));
    await OrderItem.insertMany(orderItemsToCreate);

    if (online) {
      try {
        const payment = await ops.startPayment(order);
        return res.status(201).json({
          message: 'Order created. Complete the payment to place it.',
          order_id: order._id,
          total_amount: order.total_amount,
          status: order.status,
          payment_method: 'online',
          payment_status: 'pending',
          payment
        });
      } catch (e) {
        // Nothing was charged and no payment exists: remove the half-made order completely.
        await OrderItem.deleteMany({ order: order._id });
        await Order.deleteOne({ _id: order._id });
        if (e instanceof ops.OrderPayError) return res.status(e.status).json({ message: e.message });
        throw e;
      }
    }

    events.publish(order);
    res.status(201).json({
      message: 'Order placed successfully!',
      order_id: order._id,
      total_amount: order.total_amount,
      status: order.status,
      payment_method: order.payment_method
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Attach order items to a page of orders with ONE query (instead of one query per order).
async function attachItems(orders, itemFields, comboFields) {
  const ids = orders.map((o) => o._id);
  const items = await OrderItem.find({ order: { $in: ids } })
    .populate('item', itemFields)
    .populate('combo', comboFields);
  const byOrder = new Map();
  for (const it of items) {
    const key = String(it.order);
    if (!byOrder.has(key)) byOrder.set(key, []);
    byOrder.get(key).push(it);
  }
  const now = new Date();
  return orders.map((o) => {
    const obj = { ...o.toObject(), items: byOrder.get(String(o._id)) || [] };
    if (ops.isPaidOnline(o) && o.status === 'Received' && o.refund_status === 'none') {
      // what cancelling right now would give back, so the screen can show it before the customer clicks
      obj.full_refund_seconds_left = ops.fullRefundSecondsLeft(o, now);
      obj.refund_percent_if_cancelled = ops.refundPercentFor(o, { now });
    }
    return obj;
  });
}

// @route   GET /api/orders/my?page=&limit=
// @desc    Get logged-in user's order history (paginated)
const getMyOrders = async (req, res) => {
  try {
    const pg = parsePagination(req.query, limits.pageSize.myOrders);
    await ops.expireStale();
    const filter = { user: req.user._id, ...ops.VISIBLE };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
      Order.countDocuments(filter)
    ]);
    res.status(200).json(pageResult(await attachItems(orders, 'name image_url', 'name image_url'), total, pg));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/orders/admin/all?page=&limit=
// @desc    Get all orders (admin, paginated)
const getAllOrders = async (req, res) => {
  try {
    const pg = parsePagination(req.query, limits.pageSize.adminOrders);
    await ops.expireStale();
    const [orders, total] = await Promise.all([
      Order.find(ops.VISIBLE).populate('user', 'name email').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
      Order.countDocuments(ops.VISIBLE)
    ]);
    res.status(200).json(pageResult(await attachItems(orders, 'name price', 'name'), total, pg));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/admin/:id/status
// @desc    Update order status (admin). Cancelling a paid online order refunds it in full.
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Received', 'Preparing', 'Ready', 'Delivered', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const current = await Order.findOne({ _id: req.params.id, ...ops.VISIBLE });
    if (!current) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (current.status === 'Cancelled' && status !== 'Cancelled') {
      return res.status(400).json({ message: 'A cancelled order cannot be changed.' });
    }

    const order = await Order.findOneAndUpdate(
      { _id: current._id, status: current.status },
      { status },
      { returnDocument: 'after' }
    );
    if (!order) {
      return res.status(409).json({ message: 'This order was just changed by someone else. Please refresh.' });
    }

    let refund = null;
    if (status === 'Cancelled' && current.status !== 'Cancelled') {
      refund = await ops.refundForCancellation(order, { byRestaurant: true });
    }

    events.publish(order);
    res.status(200).json({ message: 'Order status updated', order: await Order.findById(order._id), refund });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/:id/cancel
// @desc    Cancel your own order (customer) - only allowed while the kitchen hasn't started
//          preparing it yet (status = 'Received'). A paid online order is refunded: all of it
//          within the first seconds after paying, a smaller share after that (see config/orderPayment.js).
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, ...ops.VISIBLE });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // A customer may only cancel their OWN order - never anyone else's,
    // even if they know the order id (same defensive pattern used
    // throughout this project for every user-owned resource).
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only cancel your own orders' });
    }

    if (order.status !== 'Received') {
      return res.status(400).json({ message: `This order is already ${order.status.toLowerCase()} and can no longer be cancelled` });
    }

    // One atomic claim, so a cancel and a status change at the same moment cannot both win.
    const cancelled = await Order.findOneAndUpdate(
      { _id: order._id, status: 'Received' },
      { $set: { status: 'Cancelled' } },
      { returnDocument: 'after' }
    );
    if (!cancelled) {
      return res.status(400).json({ message: 'This order has just moved on and can no longer be cancelled' });
    }

    const refund = await ops.refundForCancellation(cancelled, { now: new Date() });
    events.publish(cancelled);

    res.status(200).json({
      message: 'Order cancelled successfully',
      order: await Order.findById(cancelled._id),
      refund: { ...refund, amount_rupees: refund.amount / 100 }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   POST /api/orders/:id/confirm-payment
// @desc    The browser reports a finished Razorpay payment; the signature is verified here.
const confirmPayment = async (req, res) => {
  try {
    const order = await ops.confirmWithPayment({
      orderId: req.params.id,
      userId: req.user._id,
      paymentId: req.body.razorpay_payment_id,
      signature: req.body.razorpay_signature
    });
    events.publish(order);
    res.status(200).json({
      message: 'Payment received. Your order is placed!',
      order,
      full_refund_seconds_left: ops.fullRefundSecondsLeft(order)
    });
  } catch (error) {
    if (error instanceof ops.OrderPayError) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/admin/:id/retry-refund
// @desc    Try a failed refund again (admin)
const retryRefund = async (req, res) => {
  try {
    const out = await ops.retryRefund(req.params.id);
    events.publish(out.order);
    res.status(200).json({ message: 'Refund sent.', order: out.order, amount_rupees: out.amount / 100 });
  } catch (error) {
    if (error instanceof ops.OrderPayError) return res.status(error.status).json({ message: error.message });
    res.status(502).json({ message: 'The refund could not be sent. Please try again in a moment.' });
  }
};

// @route   POST /api/orders/stream-ticket
// @desc    A short-lived, single-use ticket to open the live stream (a JWT must not go in a URL)
const streamTicket = (req, res) => res.status(200).json(events.issueTicket(req.user));

// @route   GET /api/orders/stream?ticket=
// @desc    Live "something changed" pings (Server-Sent Events). Customers hear about their own orders, admins about all.
const orderStream = async (req, res) => {
  const who = events.redeemTicket(String(req.query.ticket || ''));
  if (!who) return res.status(401).json({ message: 'This live link has expired. Reload the page.' });
  const user = await User.findById(who.userId).select('role');
  if (!user) return res.status(401).json({ message: 'User not found' });
  if (!events.addStream(res, { userId: who.userId, role: user.role })) {
    return res.status(429).json({ message: 'Too many open tabs. Close one and reload.' });
  }
};

module.exports = {
  streamTicket,
  orderStream,
  placeOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  confirmPayment,
  retryRefund
};
