const fs = require('fs');
const idl = require('./user_marketplace.json');

fs.writeFileSync('./src/contract/idl.json', JSON.stringify(idl));
