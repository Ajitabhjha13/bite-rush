const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const MenuItem = require('../models/MenuItem');

// @route   POST /api/orders
// @desc    Place a new order (customer)
const placeOrder = async (req, res) => {
  try {
    const { cart_items } = req.body; // [{ item_id, quantity }, ...]

    if (!cart_items || cart_items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    // Validate each item exists and calculate total
    let total = 0;
    const validatedItems = [];

    for (const cartItem of cart_items) {
      const menuItem = await MenuItem.findById(cartItem.item_id);

      if (!menuItem) {
        return res.status(400).json({ message: `Menu item ${cartItem.item_id} not found` });
      }

      if (!menuItem.is_available) {
        return res.status(400).json({ message: `${menuItem.name} is currently unavailable` });
      }

      const quantity = cartItem.quantity || 1;
      total += menuItem.price * quantity;

      validatedItems.push({
        item: menuItem._id,
        quantity,
        unit_price: menuItem.price
      });
    }

    // Create the order
    const order = await Order.create({
      user: req.user._id,
      total_amount: total,
      status: 'Received'
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
      status: order.status
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/orders/my
// @desc    Get logged-in user's order history
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });

    // Attach order items to each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await OrderItem.find({ order: order._id }).populate('item', 'name image_url');
        return { ...order.toObject(), items };
      })
    );

    res.status(200).json(ordersWithItems);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   GET /api/orders/admin/all
// @desc    Get all orders (admin)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });

    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await OrderItem.find({ order: order._id }).populate('item', 'name price');
        return { ...order.toObject(), items };
      })
    );

    res.status(200).json(ordersWithItems);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @route   PUT /api/orders/admin/:id/status
// @desc    Update order status (admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Received', 'Preparing', 'Ready', 'Delivered'];

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

module.exports = { placeOrder, getMyOrders, getAllOrders, updateOrderStatus };