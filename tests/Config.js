module.exports = {
  mvcx: {
    clusteringEnabled: false,

    assets: {
      paths: [
        './tests/assets/angular',
        './tests/assets/bootstrap'
      ],
      buildDir: './tests/assets/bin'
    },

    controllerPath: './tests/controllers',
    viewPath: './tests/views',

    routes: [
      { method: 'get', route: '/Books', controller: 'BooksController', action: 'retrieve' },
      { method: 'get', route: '/', view: 'Static/HomeView' }
    ]
  }
};
