const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const check = ajv.compile({
    type: 'object', additionalProperties: false, required: ['name', 'email'],
    properties: { name: { type: 'string', minLength: 2, maxLength: 50 }, email: { type: 'string', format: 'email' } }
});
module.exports.validateUser = (req, res, next) => check(req.body) ? next() : res.status(400).json({ statusCode: 400, data: { errors: check.errors } });
