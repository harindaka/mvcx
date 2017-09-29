module.exports = {
  port: 3000,
  
  mvcx: {
    autoRoutesEnabled: true,
    clusteringEnabled: false,

    assets: {
      '/assets/images/ocean-ship': './demos/assets/images/ocean-ship.jpg',

      '/assets/jquery/jquery': './demos/assets/jquery/jquery.js',

      '/assets/utils': {
        browserify: {
          modules: [
            'lazy.js', //This is a dependant npm package for the below modules
            {
              './demos/assets/utils/sum-util.js': { run: false, expose: 'utils.sum-util' }
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

    controllerPath: './demos/controllers',
    viewPath: './demos/views',
    modelPath: './demos/models',

    routes: [
      { method: 'get', route: '/books/:bookId', controller: 'books-controller', action: 'retrieve' },
      { method: 'get', route: '/books', controller: 'books-controller', action: 'retrieve', requestModel: null },
      { method: 'post', route: '/books', controller: 'books-controller', action: 'create' },
      { method: 'get', route: '/', view: 'static/home' }
    ]
  }
};
