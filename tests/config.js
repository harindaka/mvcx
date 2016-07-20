module.exports = {
  mvcx: {
    clusteringEnabled: false,

    assets: {
      '/assets/images/ocean-ship.jpg': './assets/images/ocean-ship.jpg',

      '/assets/jquery/jquery.js': './assets/jquery/jquery.js',

      '/assets/utils': {
        browserify: {
          modules: [
            'lazy.js', //This is a dependant npm package for the below modules
            {
              './assets/utils/sum-util.js': { run: false, expose: 'app.assets.utils.sum-util' }
              //More modules here
            }
          ],
          options: {
            cache: false,
            precompile: false,
            minify: false,
            gzip: false,
            debug: true
          }
        }
      }
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
