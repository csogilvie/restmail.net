module.exports = {
  // Interval in seconds after which to automatically delete mail.
  // Set to 0 for no auto-delete, and keep an eye on the size of
  // your redis db.
  expireAfter: 60 * 60 * 24,
  
  // SSL Key Path: Path to the SSL Key file; if not set, SSL is not used
  ssl_key: null,

  // SSL Certificate Path: Path to the SSL Certificate file; if not set, SSL is not used
  ssl_certificate: null,

  // Force SSL: Set if SSL should be forced
  force_ssl: false,

  // domain: Domain Name to accept email for
  domain: null
};
