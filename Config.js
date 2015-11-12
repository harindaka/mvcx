module.exports = {
  mvcx: {
    clusteringEnabled: true,
    routes: [
      { method: 'get', route: '/Booksww/:bookId', controller: 'BooksController', action: 'retrieve' }
    ]
  }
};
