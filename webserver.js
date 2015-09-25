var express = require('express');
var morgan = require('morgan');
var redis = require('redis');
var http = require('http');
var path = require('path');
var fs = require('fs');
var bodyParser = require('body-parser');

var config = config = require("./config");

var https = null;
var forceSSL = null;

if ( config.ssl_key != null || config.ssl_cert != null )
{
  try {
    https = require('https');
    if ( config.force_ssl )
    {
      forceSSL = require('express-force-ssl');
    }
  } catch (er) {
    https = null;
    forceSSL = null;
    console.log(new Date().toISOString() + ": SSL Loading Failed; acting as if it is not loaded");
  }
}

options.port = config.port;

const HOSTNAME = process.env.EMAIL_HOSTNAME || "restmail.net";
const IS_TEST = process.env.NODE_ENV === 'test';

// create a connection to the redis datastore
var db = redis.createClient();

db.on("error", function (err) {
  db = null;
  if (IS_TEST) {
    console.log(new Date().toISOString() + ": redis error! the server " +
                "won't actually store anything!  this is just fine for local dev");
  } else {
    console.log(new Date().toISOString() + ": FATAL: redis server error: " + err);
    console.log(new Date().toISOString() + ": Exiting due to fatal error...");
    process.exit(1);
  }
});

var options = {};
if ( config.ssl_key != null )
{
  options.key = fs.readFileSync( config.ssl_key );
}

if ( config.ssl_cert != null )
{
  options.cert = fs.readFileSync( config.ssl_cert );
}

var app = express();
app.use( bodyParser.json() ); // to support JSON-encoded bodies
app.use( bodyParser.urlencoded( { extended: true })); // to support URL-encoded bodies

if ( forceSSL != null && config.force_ssl )
{
  app.use( forceSSL );
}

// log to console when not testing
if (!IS_TEST) app.use(morgan('combined'));

// automatically make user part only input into email with
// default hostname.
function canonicalize(email) {
  if (email.indexOf('@') === -1) email = email + '@' + HOSTNAME;
  return email;
}

app.get('/', function(req, res) { 
  res.set('Content-Type', 'text/html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/', function(req, res) {
  var email = canonicalize( req.body.email );
  res.redirect('/html/' + email);
})

// the 'todo/get' api gets the current version of the todo list
// from the server
app.get('/mail/:user', function(req, res) {
  if (!db) { 
    return IS_TEST ? res.json([]) : res.status(500).end();
  }

  req.params.user = canonicalize(req.params.user);

  db.lrange(req.params.user, -10, -1, function(err, replies) {
    if (err) {
      console.log(new Date().toISOString() + ": ERROR", err);
      res.status(500).end();
    } else {
      var arr = [];
      replies.forEach(function (r) {
        try {
          arr.push(JSON.parse(r));
        } catch(e) { }
      });
      res.set("Content-Type", "application/json");
      res.send(JSON.stringify(arr, undefined, 2));
    }
  });
});

app.get('/html/:user', function(req, res) {
  if ( !db ) {
      return IS_TEST ? res.json([]) : res.status(500).end();
  }

  req.params.user = canonicalize(req.params.user);

  db.lrange(req.params.user, -10, -1, function(err, replies) { 
    if (err) {
      console.log(new Date().toISOString() + ": ERROR", err);
      res.status(500).end();
    } else {
      var arr = [];
      replies.forEach(function (r) {
        try {
          arr.push(JSON.parse(r));
        } catch(e) {
          console.log(new Date().toISOString() + ": ERROR", err);
        }
      });
      res.set("Content-Type", "text/html");
      var html = "<html><head><title>Email for: " + req.params.user + "</title><style>div { margin: 5px; }\niframe { height: 400px;  width: 100%; border: 1px solid black; padding: 0;margin: 0;}\n</style></head><body><h1 style='font-family: verdana;'>Email for: " + req.params.user + "</h1>"
      var i = 0;
      arr.forEach(function (a)
      {
        var row = '<div style="border: 1px solid #ddd;">' + "\n" + '<p>To: ' + a.to[0].name + ' &lt;' + a.to[0].address + '&gt;<br />' + "\n" + 'From: ' + a.from[0].name + ' &lt;' + a.from[0].address + '&gt;<br />' + "\n" + 'Subject: ' + a.subject + '</p>' + "\n" + '<iframe src="' + req.originalUrl + '/' + i + '"></iframe>' + "\n" + '</div>' + "\n" + '';
        html = html + row;
        i++;
      });
      html = html + '</body></html>';
      res.send(html);
    }
  });
});

app.get('/html/:user/:email', function(req, res) {
  if ( !db ) {
      return IS_TEST ? res.json([]) : res.status(500).end();
  }

  req.params.user = canonicalize(req.params.user);
  req.params.email = parseInt(req.params.email);
  db.lrange(req.params.user, req.params.email, req.params.email, function(err, replies) { 
    if (err) {
      console.log(new Date().toISOString() + ": ERROR", err);
      res.status(500).end();
    } else {
      var arr = [];
      replies.forEach(function (r) {
        try {
          arr.push(JSON.parse(r));
        } catch(e) {
          console.log(new Date().toISOString() + ": ERROR", err);
        }
      });
      if ( arr[0].html )
      {
        res.set("Content-Type", "text/html; charset=utf-8");
        res.send(arr[0].html);
      }
      else
      {
        res.set("Content-Type", "text/plain; charset=utf-8");
        res.send(arr[0].text);
      }
    }
  });
});

app.delete('/mail/:user', function(req, res) {
  if (!db) {
    return res.status(IS_TEST ? 200 : 500).end();
  }

  req.params.user = canonicalize(req.params.user);

  db.del(req.params.user, function(err) {
    res.status(err ? 500 : 200).end();
  });
});

// handle starting from the command line or the test harness
if (process.argv[1] === __filename) {
  app.listen(options.port.webserver_http);
  if ( https != null )
  {
    https.createServer(options, app).listen(options.port.webserver_https);
  }
} else {
  module.exports = function(cb) {
    var server = http.createServer(app);
    server.listen(function() {
      cb(null, server.address().port);
    });
  };
}
