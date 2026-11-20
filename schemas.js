const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const check = ajv.compile({
    type: 'object', additionalProperties: false, required: ['name', 'email'],
    properties: { name: { type: 'string', minLength: 2, maxLength: 50 }, email: { type: 'string', format: 'email' } }
});
module.exports.validateUser = (req, res, next) => check(req.body) ? next() : res.status(400).json({ statusCode: 400, data: { errors: check.errors } });
const checkProduct = ajv.compile({
    type: 'object', additionalProperties: false, required: ['name', 'priceCents', 'stock'],
    properties: {
        name: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
        priceCents: { type: 'integer', minimum: 0, maximum: 999999999 },
        stock: { type: 'integer', minimum: 0, maximum: 999999999 }
    }
});
module.exports.validateProduct = (req, res, next) => checkProduct(req.body)
    ? next()
    : res.status(400).json({ statusCode: 400, data: 'Revisa el nombre, el precio y las existencias' });
