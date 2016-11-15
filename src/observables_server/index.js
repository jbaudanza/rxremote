import {Server as WebSocketServer} from 'ws';
import Rx from 'rxjs';

import onWebSocketConnection from './onWebSocketConnection';


export default class Server {
  constructor(httpServer, routeTable={}) {
    this.routeTable = routeTable;

    if (httpServer) {
      this.attachToHttpServer(httpServer);
    }
  }

  attachToHttpServer(httpServer) {
    this.wss = new WebSocketServer({server: httpServer});
    this.attachToWebSocketServer(this.wss);
  }

  attachToWebSocketServer(wss) {
    let connectionCounter = 0;

    const eventSubject = new Rx.Subject();
    const logSubject = new Rx.Subject();

    this.events = eventSubject.asObservable();
    this.log = logSubject.asObservable();

    this.wss = wss;
    this.wss.on('connection', (socket) => {
      connectionCounter++;
      onWebSocketConnection(
          socket, this.routeTable, connectionCounter, logSubject, eventSubject
      );
    });
  }

  add(key, callback) {
    this.routeTable[key] = callback;
  }
}
