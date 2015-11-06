module.exports = function(mvcxConfig){
  var self = this;

  this.mvcxConfig = initializeConfiguration(mvcxConfig);
  console.log(mvcxConfig);
  this.expressApp = null;
  this.logger = null;
  this.dependencyResolver = null;
  this.isInitializationSuccessful = false;

  this.initialize = function(done){
    try{
      console.log('info: [mvcx] Initializing...');

      if(self.mvcxConfig.clusteringEnabled) {
          var cluster = require('cluster');
          var http = require('http');
          var numCPUs = require('os').cpus().length;
          var appConfig = null;

          if (cluster.isMaster) {
              console.log('info: [mvcx] Clustering for ' + numCPUs + ' CPU cores...');

              // Fork workers.
              for (var i = 0; i < numCPUs; i++) {
                  console.log('info: [mvcx] Spawning worker ' + (i + 1) + '...');
                  cluster.fork();
              }

              console.log('info: [mvcx] Clustering intialized with ' + numCPUs + ' worker processes.');

              cluster.on('exit', function (worker, code, signal) {
                  console.log('info: [mvcx] Worker process with process id ' + worker.process.pid + ' terminated.');
              });
          } else {
              return initializeCore(done);
          }
      }
      else{
          console.log('info: [mvcx] Clustering is disabled.');
          return initializeCore(done);
      }
    }
    catch(e){
      done(e, null);
    }
  };

  this.createHttpServer = function() {
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating http server...');

    var http = self.dependencyResolver.resolve('http');
    var server  = http.createServer(self.expressApp);

    self.logger.info('[mvcx] Http server created.');

    server.on('connection', function (socket) {
        if(self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
            //logger.debug('Connection opened. Setting keep alive timeout to %s seconds', config.keepAliveTimeoutSeconds);
            socket.setKeepAlive(true);
            socket.setTimeout(self.mvcxConfig.keepAliveTimeoutSeconds * 1000, function () {
                //logger.debug('Connection closed after exceeding keep alive timeout.');
            });
        }
        else{
            socket.setKeepAlive(false);
        }
    });

    if(self.mvcxConfig.keepAliveTimeoutSeconds > 0) {
        self.logger.info('[mvcx] Server connection keep-alive timeout set to %s seconds.', self.mvcxConfig.keepAliveTimeoutSeconds);
    }else {
        self.logger.info('[mvcx] Server connection keep-alive is disabled.');
    }

    return server;
  };

  this.createWebSocketServer = function(server){
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating web socket (socket.io) server...');

    var socketio = self.dependencyResolver.resolve('socket.io');
    return socketio(server);

    self.logger.info('[mvcx] Web socket server created.');
  }

  function initializeCore(done){
    try
    {
      var appConfig = null;

      self.logger = initializeLogging(mvcxConfig);

      self.dependencyResolver = initializeIoc(mvcxConfig, appConfig);

      self.expressApp = initializeExpress();

      self.logger.info('[mvcx] Intialization completed.');

      self.isInitializationSuccessful = true;

      done(null, appConfig);
    }
    catch(e){
      var failureMessage = '[mvcx] Intialization failed.';
      if(self.logger != null){
        self.logger.info(failureMessage);
      }
      else{
        console.log(failureMessage);
      }

      done(e, null);
    }
  }

  function initializeConfiguration(mvcxConfig){
    if(isEmpty(mvcxConfig)){
      mvcxConfig = {};
    }

    var hooks = hydrateConfigPath(mvcxConfig, 'hooks');

    var DependencyResolver = require('./DependencyResolver');
    var resolver = new DependencyResolver();

    hydrateConfigPath(hooks, 'ioc.register', resolver.register);
    hydrateConfigPath(hooks, 'ioc.resolve', resolver.resolve);
    hydrateConfigPath(hooks, 'ioc.compose', function(register) {});

    return mvcxConfig;
  }

  function isEmpty(val){
    return (typeof (val) === 'undefined' || val == null);
  }

  function hydrateConfigPath(config, path, value){
    var props = path.split('.');

    var lastIndex = props.length - 1;
    for(var i=0; i < props.length; i++){
      var prop = props[i];
      if(i = lastIndex){
        if(isEmpty(config[prop])){
          config[prop] = value;
        }
      }
      else if(isEmpty(config[prop])){
          config[prop] = {};
      }

      config = config[prop];
    }

    return config;
  }

  function initializeIoc(appConfig){
    var DependencyResolverClass = self.mvcxConfig.dependencyResolver;
    var dependencyResolver = new DependencyResolverClass();

    self.logger.info('[mvcx] Registering dependencies...');

    var express = require('express');
    var expressApp = express();
    DependencyResolver.register({ name: 'express', dependency: express, lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'express-app', dependency: expressApp, lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'config', dependency: appConfig, lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'logger', dependency: self.logger, lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'q', dependency: require('q'), lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'compression', dependency: require('compression'), lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'body-parser', dependency: require('body-parser'), lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'http', dependency: require('http'), lifestyle: 'singleton' }),
    DependencyResolver.register({ name: 'socket.io', dependency: require('socket.io'), lifestyle: 'singleton' })

    self.mvcxConfig.hooks.ioc.compose(dependencyResolver.register);

    self.logger.info('[mvcx] Dependency registration completed.');

    return dependencyResolver;
  }

  function initializeExpress(){
    self.logger.info('[mvcx] Creating express app...');
    var expressApp = self.dependencyResolver.resolve('express');

    self.logger.info('[mvcx] Registering standard middleware...');

    if(self.mvcxConfig.compressionEnabled){
        var compress = self.dependencyResolver.resolve('compression');
        expressApp.use(compress());
        self.logger.info('[mvcx] Gzip compression is enabled.');
    }
    else{
        self.logger.info('[mvcx] Gzip compression is disabled.');
    }

    var bodyParser  = self.dependencyResolver.resolve('body-parser');
    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use(bodyParser.json({limit:(self.mvcxConfig.requestLimitKB)+"kb"}));

    self.logger.info('[mvcx] Standard middleware registration completed.');

    //Middleware

    //Route Manager

    return expressApp;
  }

  function initializeLogging(){
    var logger;

    var winston = require('winston');
    winston.emitErrs = true;

    var winstonTransports = [];
    if(self.mvcxConfig.loggerAppenders && self.mvcxConfig.loggerAppenders.length > 0){
        for(var i=0; i < self.mvcxConfig.loggerAppenders.length; i++){
            var appender = self.mvcxConfig.loggerAppenders[i];
            winstonTransports.push(new winston.transports[appender.type](appender.options));
        }
    }
    else{
        winstonTransports.push(new winston.transports.Console({
            level: 'silly',
            handleExceptions: true,
            json: false,
            colorize: true
        }));
    }

    logger = new winston.Logger({
        transports: winstonTransports,
        exitOnError: false
    });

    logger.info('[mvcx] Overriding Console.log...');

    console.log = logger.debug;

    logger.info('[mvcx] Logger initialized.');

    return logger;
  }
};
