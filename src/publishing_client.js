const {fetch, Request, Response, Headers} = require('fetch-ponyfill')();


import sessionId from './session_id';


export default class PublishingClient {
  constructor(host) {
    this.host = (host || '');
  }

  publish(key, value, token) {
    const body = {
      sessionId: sessionId,
      key: key,
      value: value
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = "Bearer " + token;
    }

    return fetch(this.host + '/events', {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
      headers: headers
    }).then(r => r.json());
  }
}
