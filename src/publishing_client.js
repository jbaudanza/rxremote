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

    const url = this.host + '/events';

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = "Bearer " + token;
    }

    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify(body),
      headers: headers
    }).then(r => r.json());
  }
}
