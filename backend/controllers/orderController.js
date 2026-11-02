const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const MenuItem = require('../models/MenuItem');
const Combo = require('../models/Combo');
const { parsePagination, pageResult } = require('../utils/paginate');
const limits = require('../config/limits');
const { DELIVERY_CITY } = require('../config/delivery');

// @route   POST /api/orders
// @desc    Place a new order (customer)
const placeOrder = async (req, res) => {
  try {
    const { cart_items, delivery: d } = req.body; // [{ type: 'item'|'combo', item_id/combo_id, quantity }, ...]

    if (!cart_items || cart_items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

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

        // Only store a spice level if the dish actually supports it — ignore
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
      payment_method: 'cod'
    });

    // Create order items linked to this order
    const orderItemsToCreate = validatedItems.map((item) => ({
      order: order._id,
      ...item
    }));
    await OrderItem.insertMany(orderItemsToCreate);

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
  return orders.map((o) => ({ ...o.toObject(), items: byOrder.get(String(o._id)) || [] }));
}

// @route   GET /api/orders/my?page=&limit=
// @desc    Get logged-in user's order history (paginated)
const getMyOrders = async (req, res) => {
  try {
    const pg = parsePagination(req.query, limits.pageSize.myOrders);
    const filter = { user: req.user._id };
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
    const [orders, total] = await Promise.all([
      Order.find().populate('user', 'name email').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
      Order.countDocuments()
    ]);
    res.status(200).json(pageResult(await attachItems(orders, 'name price', 'name'), total, pg));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/admin/:id/status
// @desc    Update order status (admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Received', 'Preparing', 'Ready', 'Delivered', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.status(200).json({ message: 'Order status updated', order });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/:id/cancel
// @desc    Cancel your own order (customer) — only allowed while the
//          kitchen hasn't started preparing it yet (status = 'Received').
const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // A customer may only cancel their OWN order — never anyone else's,
    // even if they know the order id (same defensive pattern used
    // throughout this project for every user-owned resource).
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only cancel your own orders' });
    }

    if (order.status !== 'Received') {
      return res.status(400).json({ message: `This order is already ${order.status.toLowerCase()} and can no longer be cancelled` });
    }

    order.status = 'Cancelled';
    await order.save();

    res.status(200).json({ message: 'Order cancelled successfully', order });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = { placeOrder, getMyOrders, getAllOrders, updateOrderStatus, cancelOrder };