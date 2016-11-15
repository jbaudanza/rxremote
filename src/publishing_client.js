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

    return this.fetchCsrfToken().then(function(csrf) {
      const headers = {
        'Content-Type': 'application/json',
        'csrf-token': csrf
      };

      if (token) {
        headers['Authorization'] = "Bearer " + token;
      }

      return fetch(url, {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(body),
        headers: headers
      }).then(r => r.json())
    });
  }

  fetchCsrfToken() {
    if (!this.csrfPromise) {
      this.csrfPromise = fetch(this.host + '/csrf', {credentials: 'include'})
          .then(r => r.json())
          .then((response) => response.csrf);
    }
    return this.csrfPromise;
  }
}
