const path = require("path");
const YAML = require("yamljs");

let config = {};
try {
  const configPath = path.join(process.cwd(), "config.yml"); // desde la raíz backend/
  config = YAML.load(configPath) || {};
} catch (e) {
  config = {};
}

module.exports = { config };
