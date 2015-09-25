var smtp = require('smtp-protocol');
var redis = require("redis");
var MailParser = require("mailparser").MailParser;
var util = require('util');
var fs = require('fs');
var config = require("./config");

const IS_TEST = process.env.NODE_ENV === 'test';

var options = {};
options.domain = process.env.EMAIL_HOSTNAME || config.domain || "restmail.net";

if ( config.ssl_key != null )
{
  options.key = fs.readFileSync( config.ssl_key );
}

if ( config.ssl_cert != null )
{
  options.cert = fs.readFileSync( config.ssl_cert );
}

options.port = config.port;

// create a connection to the redis datastore
var db = redis.createClient();

function log(/* format, values... */) {
  if (IS_TEST) return;
  var args = Array.prototype.slice.call(arguments);
  var timestamp = new Date().toISOString();
  args[0] = util.format('[%s] %s', timestamp, args[0]);
  process.stderr.write(util.format.apply(null, args) + '\n');
}

function logError(err) {
  log("ERROR (oh noes!): " + err);
}

var server = smtp.createServer(options, function (req) {
  log('Handling SMTP request');

  req.on('starttls', function( to, ack ) {
    ack.accept( 250, 'OK' );
  });

  ['rcpt', 'mail', 'to', 'from'].forEach(function(event)  {
    req.on(event, function () {
      var ack = arguments[arguments.length - 1];
      ack.accept(250, "OK");
    });
  });

  req.on('greeting', function (to, ack) {
    ack.accept(250, "STARTTLS");
  });

  req.on('message', function (stream, ack) {
    var mailparser = new MailParser({
      streamAttachments: true
    });

    stream.pipe(mailparser);

    mailparser.on('end', function(mail) {
      mail.receivedAt = new Date().toISOString();
      var user = req.to;
      log('Received message for', user);

      db.rpush(user, JSON.stringify(mail), function(err) {
        if (err) return logError(err);

        if (config.expireAfter) {
          db.expire(user, config.expireAfter);
        }

        db.llen(user, function(err, replies) {
          if (err) return logError(err);

          if (replies > 10) db.ltrim(user, -10, -1, function(err) {
            if (err) return logError(err);
          });
        });
      });
    });

    ack.accept(354, 'OK');
  });
});

// handle starting from the command line or the test harness
if (process.argv[1] === __filename) {
  log('Starting up on port', options.port.mailserver);
  server.listen(options.port.mailserver);
} else {
  module.exports = function(cb) {
    server.listen(0, function(err) {
      cb(err, server.address().port);
    });
  };
}
