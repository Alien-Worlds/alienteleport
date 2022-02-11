const config = require(process.env['CONFIG'] || './config');

function extract_quantity(tokens) {
  const amount = (tokens / Math.pow(10, config.precision)).toFixed(
    config.precision
  );
  const quantity = `${amount} ${config.symbol}`;
  return quantity;
}

test('extract_quantity', () => {
  console.log('precision:', config.precision);
  expect(extract_quantity(13536017)).toBe('0.13536017 TLM');
  expect(extract_quantity(1500)).toBe('0.1500 TLM');
  expect(extract_quantity(0.15)).toBe('0.0000 TLM');
  expect(extract_quantity(15.0124)).toBe('15.0124 TLM');
  expect(extract_quantity(18700000)).toBe('1870.0000 TLM');
});
