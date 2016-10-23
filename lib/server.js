'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _ws = require('ws');

var _rxjs = require('rxjs');

var _rxjs2 = _interopRequireDefault(_rxjs);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _batches = require('./batches');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function onWebSocketConnection(socket, observables, connectionId, logSubject, eventSubject) {
  var remoteAddr = socket.upgradeReq.headers['x-forwarded-for'] || socket.upgradeReq.connection.remoteAddress;

  var sessionId = null;

  function log(message) {
    var str = '[' + remoteAddr + '] ' + message;
    logSubject.next(str);
  }

  function send(object) {
    if (socket.readyState === 1) {
      // OPEN
      socket.send(JSON.stringify(object));
    } else {
      log('Tried to send to WebSocket in readyState: ' + socket.readyState);
    }
  }

  function createObserver(subscriptionId) {
    return {
      next: function next(batch) {
        send({ type: 'events', batch: batch, subscriptionId: subscriptionId });
      },
      error: function error(_error) {
        log(_error);
        send({ type: 'error', error: _error, subscriptionId: subscriptionId });
      },
      complete: function complete() {
        send({ type: 'complete', subscriptionId: subscriptionId });
      }
    };
  }

  function insertEvent(event) {
    var meta = {
      connectionId: connectionId,
      sessionId: sessionId,
      ipAddress: remoteAddr
    };

    eventSubject.next([event, meta]);
  }

  log("WebSocket connection opened");

  var subscriptions = {};

  // This gets called when the socket is closed.
  function cleanup() {
    log("Closing WebSocket");

    _lodash2.default.values(subscriptions).forEach(function (sub) {
      sub.unsubscribe();
    });
    subscriptions = {};

    insertEvent({ type: 'connection-closed' });
  };

  socket.on('message', function (data) {
    var message = void 0;

    try {
      message = JSON.parse(data);
    } catch (e) {
      log("Error parsing JSON");
      console.error(e);
    }

    if (typeof message.type !== 'string') {
      log("Received message without a type");
      return;
    }

    switch (message.type) {
      case 'hello':
        if (typeof message.sessionId !== 'string') {
          log('expected sessionId');
          break;
        }
        sessionId = message.sessionId;
        insertEvent({ type: 'connection-open' });
        log("open session " + message.sessionId);
        break;

      case 'subscribe':
        if (typeof message.offset !== 'number') {
          log("expected offset number");
          break;
        }

        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId string");
          break;
        }

        if (message.subscriptionId in subscriptions) {
          log("subscriptionId sent twice: " + message.subscriptionId);
          break;
        }

        var fn = observables[message.name];

        log('subscribing to ' + message.name);

        if (fn) {
          var observable = fn(message.offset, socket, sessionId);
          if (observable && typeof observable.subscribe === 'function') {
            if (typeof observable.subscribe === 'function') {
              // TODO: If this is an ArrayObservable, just send the array
              // as one batch.
              //if (typeof Array.isArray(observable.array)) {
              //}

              var subscription = (0, _batches.rewrapBatches)(observable).subscribe(createObserver(message.subscriptionId));

              subscription.name = message.name;

              subscriptions[message.subscriptionId] = subscription;
            }
          } else {
            console.error('Expected Rx.Observable instance for key ' + message.name + ', got: ' + observable);
            send({
              type: 'error',
              subscriptionId: message.subscriptionId,
              error: {
                code: '500',
                message: 'Internal Server Error'
              }
            });
          }
        } else {
          send({
            type: 'error',
            subscriptionId: message.subscriptionId,
            error: {
              code: 404,
              message: 'Not found'
            }
          });
        }

        break;

      case 'unsubscribe':
        if (!(message.subscriptionId in subscriptions)) {
          log("subscriptionId not found: " + message.subscriptionId);
          break;
        }

        if (typeof message.subscriptionId !== 'number') {
          log("expected subscriptionId number");
          break;
        }

        log('unsubscribing from ' + subscriptions[message.subscriptionId].name);
        subscriptions[message.subscriptionId].unsubscribe();
        delete subscriptions[message.subscriptionId];
        break;

      default:
        log('Received unknown message type ' + message.type);
        return;
    }
  });

  socket.on('close', cleanup);
}

var Server = function () {
  function Server(httpServer) {
    var routeTable = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, Server);

    this.routeTable = routeTable;

    if (httpServer) {
      this.attachToHttpServer(httpServer);
    }
  }

  _createClass(Server, [{
    key: 'attachToHttpServer',
    value: function attachToHttpServer(httpServer) {
      this.wss = new _ws.Server({ server: httpServer });
      this.attachToWebSocketServer(this.wss);
    }
  }, {
    key: 'attachToWebSocketServer',
    value: function attachToWebSocketServer(wss) {
      var _this = this;

      var connectionCounter = 0;

      var eventSubject = new _rxjs2.default.Subject();
      var logSubject = new _rxjs2.default.Subject();

      this.events = eventSubject.asObservable();
      this.log = logSubject.asObservable();

      this.wss = wss;
      this.wss.on('connection', function (socket) {
        connectionCounter++;
        onWebSocketConnection(socket, _this.routeTable, connectionCounter, logSubject, eventSubject);
      });
    }
  }, {
    key: 'add',
    value: function add(key, callback) {
      this.routeTable[key] = callback;
    }

    // cleanup() {
    //   _.invoke(this.wss.clients, 'cleanup');
    // }

  }]);

  return Server;
}();

exports.default = Server;