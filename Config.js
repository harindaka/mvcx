module.exports = {
  mvcx: {
    clusteringEnabled: true,
    routes: [
      { method: 'get', route: '/Books', controller: 'BooksController', action: 'retrieve' },
      { method: 'get', route: '/', view: 'Static/HomeView' }
    ]
  }
};
