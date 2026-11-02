// Where we deliver. One place to change it.
// Vadodara city uses the 390001 to 390025 PIN series. The nearby 391xxx codes
// (Gotri, Jawahar Nagar, Chhani, and so on) are left out on purpose; add them
// to EXTRA_PINCODES if the restaurant decides to serve them.
const DELIVERY_CITY = 'Vadodara';

const CITY_PINCODES = Array.from({ length: 25 }, (_, i) => String(390001 + i));
const EXTRA_PINCODES = [];

const SERVICEABLE = new Set([...CITY_PINCODES, ...EXTRA_PINCODES]);

function isServiceablePincode(pin) {
  return SERVICEABLE.has(String(pin || '').trim());
}

// "+91 98765-43210", "098765 43210", "9876543210" -> "9876543210"
function normalizePhone(value) {
  let digits = String(value == null ? '' : value).replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

module.exports = { DELIVERY_CITY, isServiceablePincode, normalizePhone };
