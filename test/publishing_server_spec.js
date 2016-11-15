import assert from 'assert';
import http from 'http';
import express from 'express';

import PublishingServer from '../src/publishing_server';
import PublishingClient from '../src/publishing_client';

describe.only('PublishingServer', () => {
  it('should work', (done) => {
    const app = express();
    const handlers = {
      foo(value, meta) {},
      bar(value, meta) {}
    };

    app.use(PublishingServer(handlers, 'its-a-secret'));

    let port;

    const server = app.listen(function() {
      port = server.address().port;
      console.log(port);
      
      const client = new PublishingClient('http://0.0.0.0:' + port);
      console.log(client)

      client.publish('foo', 'bar').then(function() {
        done();
      });
    })
  });
});