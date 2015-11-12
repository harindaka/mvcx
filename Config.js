module.exports = {
  mvcx: {
    clusteringEnabled: true,
    routes: [
      { method: 'get', route: '/Books', controller: 'BooksController', action: 'retrieve' }
    ]
  }
};
