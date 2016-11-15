import assert from 'assert';
import http from 'http';
import express from 'express';

import {PublishingClient, PublishingServer} from '../';


describe('PublishingServer', () => {
  it('should work', (done) => {
    const app = express();
    const handlers = {
      foo(value, meta) { return Promise.resolve(value); },
    };

    app.use(PublishingServer(handlers, 'its-a-secret'));

    let port;

    const server = app.listen(function() {
      const client = new PublishingClient('http://0.0.0.0:' + server.address().port);

      client.publish('foo', 'bar').then(function(result) {
        assert.equal(result, 'bar');
        done();
      });
    })
  });
});
