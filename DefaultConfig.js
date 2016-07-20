module.exports = {
  autoRoutesEnabled: true,

  clusteringEnabled: false,
  compressionEnabled: true,
  requestLimitKB: 5120,
  keepAliveTimeoutSeconds: 30,
  includeErrorStackInResponse: true,

  viewEngine: 'ejs',

  assets: {
    paths: [
      './assets/css',
      './assets/js',
      './assets/img'
    ], //The directories that assets will be read from, in order of preference.
    servePath: '/assets', //The virtual path in which assets will be served over HTTP. If hosting assets locally, supply a local path (say, "assets"). If hosting assets remotely on a CDN, supply a URL: "http://myassets.example.com/assets".
    precompile: ["*.*"], //An array of assets to precompile while the server is initializing. Patterns should match the filename only, not including the directory.
    build: true, //Should assets be saved to disk (true) in buildDir, or just served from memory (false)?
    buildDir: './assets/bin', //The directory to save (and load) compiled assets to/from.
    compile: true, //Should assets be compiled if they don’t already exist in the buildDir?
    compress: false, //Should assets be minified? If enabled, requires uglify-js and csswring. Set to true in production
    gzip: false, //Should assets have gzipped copies in buildDir?
    fingerprinting: true, //Should fingerprints be appended to asset filenames?
    sourceMaps: true //Should source maps be served? Set to false in production
  },

  controllerPath: './controllers',
  controllerSuffix: '-controller',
  viewPath: './views',
  modelPath: './models',
  requestModelSuffix: 'Request',
  baseUrlPrefix: '',
  routes: null,

  loggerAppenders: [
      {
          type: "Console",
          options: {
              level: "silly",
              timestamp: true,
              handleExceptions: false,
              json: false,
              colorize: true,
              prettyPrint: true
          }
      }
  ],

  hooks: require('./Hooks'),
  internalViewPath: 'views'
};
