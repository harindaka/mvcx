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
      { method: 'get', route: '/books/:bookId', controller: 'books-controller', action: 'retrieve' },
      { method: 'get', route: '/books', controller: 'books-controller', action: 'retrieve' },
      { method: 'post', route: '/books', controller: 'books-controller', action: 'create', requestModel: 'BooksCreateRequest' },
      { method: 'get', route: '/', view: 'static/home' }
    ]
  }
};
