module.exports = function(configMetadata){
  var self = this;

  this.q = require('q');
  this.lazyjs = require('lazy.js');
  this.appConfig = mergeConfig(configMetadata);
  this.mvcxConfig = self.appConfig.mvcx;
  this.expressApp = null;
  this.logger = null;
  this.isInitializationSuccessful = false;

  this.initialize = function(){
    return self.q.Promise(function(resolve, reject, notify) {
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
                initializeCore();
            }
        }
        else{
            console.log('info: [mvcx] Clustering is disabled.');
            initializeCore();
        }

        var result = {
          express: self.expressApp,
          config: self.appConfig
        };

        return resolve(result);
      }
      catch(e){
        var failureMessage = '[mvcx] Intialization failed.';
        if(self.logger != null){
          self.logger.error(failureMessage);
        }
        else{
          console.log(failureMessage);
        }

        reject(e);
      }
    });
  };

  this.loadControllers = function(){
    self.logger.info('[mvcx] Loading controllers...');

    var ModuleLoader = require('./ModuleLoader');
    var moduleLoader = new ModuleLoader();
    var path = require('path');

    var controllers = moduleLoader.load(path.resolve(self.mvcxConfig.controllerPath), self.mvcxConfig.controllerSuffix);

    if(controllers == null){
      self.logger.info('[mvcx] No controllers were found.');
    }
    else{
      self.logger.info('[mvcx] Found ' + controllers.length + ' controller(s).');

      var iocContainer = self.mvcxConfig.hooks.ioc;

      var controllerRouteMap = createControllerHashMap();
      self.lazyjs(controllers).each(function(controller){
        iocContainer.register(controller.moduleName, controller.module, 'perRequest');

        var routeForGetDefined = false;
        var routeForPutDefined = false;
        var routeForPostDefined = false;
        var routeForDeleteDefined = false;
        if(controllerRouteMap.has(controller.moduleName)){
          var explicitRouteMethods = controllerRouteMap.get(controller.moduleName);
          routeForGetDefined = explicitRouteMethods.has('get');
          routeForPutDefined = explicitRouteMethods.has('put');
          routeForPostDefined = explicitRouteMethods.has('post');
          routeForDeleteDefined = explicitRouteMethods.has('delete');

          self.lazyjs(explicitRouteMethods.values()).each(function(routesArray){
            self.lazyjs(routesArray).each(function(route){
              registerControllerAction(route.method, route.route, route.controller, route.action);
            });
          });
        }

        if(self.mvcxConfig.autoRoutesEnabled){
          if(!routeForGetDefined) registerControllerAction('get', controller.modulePrefix, controller.moduleName, 'get');
          if(!routeForPutDefined) registerControllerAction('put', controller.modulePrefix, controller.moduleName, 'put');
          if(!routeForPostDefined) registerControllerAction('post', controller.modulePrefix, controller.moduleName, 'post');
          if(!routeForDeleteDefined) registerControllerAction('delete', controller.modulePrefix, controller.moduleName, 'delete');
        }
      });
    }

    self.logger.info('[mvcx] Controller loading completed.');
  };

  this.createHttpServer = function() {
    if(!self.isInitializationSuccessful){
      throw new Error('[mvcx] Unable create server when mvcx has not been initialized successfully.');
    }

    self.logger.info('[mvcx] Creating http server...');

    var http = self.mvcxConfig.hooks.ioc.resolve('http').value;
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

    var socketio = self.mvcxConfig.hooks.ioc.resolve('socket.io').value;
    return socketio(server);

    self.logger.info('[mvcx] Web socket server created.');
  }

  function initializeCore(){
      var appConfig = null;

      self.logger = initializeLogging();

      initializeIoc();

      self.expressApp = initializeExpress();

      self.logger.info('[mvcx] Intialization completed.');

      self.isInitializationSuccessful = true;
  }

  function mergeConfig(configMetadata) {
    var environment;
    var config;
    console.log('info: [mvcx] Initializing configuration...');

    var baseConfig = configMetadata.baseConfig;
    if (typeof(baseConfig) === 'undefined' || baseConfig == null) {
        baseConfig = {};
    }

    var merge = require('merge');

    console.log('info: [mvcx] Checking environment configuration indicator...');
    var environment = null;
    if(!isEmpty(configMetadata.environmentIndicatorVariable)){
      environment = process.env[configMetadata.environmentIndicatorVariable];
    }

    if (!isEmpty(environment)) {
        console.log('info: [mvcx] Loading configuration override for ' + environment + ' environment.');
        var overrideConfig = require(configMetadata.environments[environment]);
        if (!(overrideConfig)) {
            throw new Error('[mvcx] The ' + env + ' environment configuration override is missing.');
        }

        console.log('info: [mvcx] Merging configuration override for ' + environment + ' environment...');
        config = merge.recursive(true, baseConfig, overrideConfig);
    }
    else {
        console.log('info: [mvcx] No environment indicator found. Continuing with the base configuration...');
        config = baseConfig;
    }

    var overriddenMvcxConfig = config.mvcx;
    if(isEmpty(overriddenMvcxConfig)){
      overriddenMvcxConfig = {};
    }

    console.log('info: [mvcx] Merging mvcx default configuration with specified overrides from the application configuration...');
    config.mvcx = merge.recursive(true, require('./DefaultConfig'), overriddenMvcxConfig);

    console.log('info: [mvcx] Configuration initialized.');
    return config;
  }

  function isEmpty(val){
    return (typeof (val) === 'undefined' || val == null);
  }

  function initializeIoc(){
    self.logger.info('[mvcx] Registering dependencies...');

    var express = require('express');
    var expressApp = express();

    var ioc = self.mvcxConfig.hooks.ioc;
    ioc.register('express', { value: express }, 'singleton'),
    ioc.register('expressApp', { value: expressApp }, 'singleton'),
    ioc.register('config', { value: self.appConfig }, 'singleton'),
    ioc.register('logger', { value: self.logger }, 'singleton'),
    ioc.register('q', { value: self.q }, 'singleton'),
    ioc.register('compression', { value: require('compression') }, 'singleton'),
    ioc.register('body-parser', { value: require('body-parser') }, 'singleton'),
    ioc.register('http', { value: require('http') }, 'singleton'),
    ioc.register('socket.io', { value: require('socket.io') }, 'singleton')
    ioc.register('merge', { value: require('merge') }, 'singleton')
    ioc.register('lazy.js', { value: require('lazy.js') }, 'singleton')
    ioc.register('hashmap', { value: require('hashmap') }, 'unique')

    self.logger.info('[mvcx] Dependency registration completed.');
  }

  function initializeExpress(){
    self.logger.info('[mvcx] Creating express app...');
    var iocContainer = self.mvcxConfig.hooks.ioc;
    var expressApp = iocContainer.resolve('expressApp').value;

    self.logger.info('[mvcx] Registering standard middleware...');

    if(self.mvcxConfig.compressionEnabled){
        var compress = iocContainer.resolve('compression').value;
        expressApp.use(compress());
        self.logger.info('[mvcx] Gzip compression is enabled.');
    }
    else{
        self.logger.info('[mvcx] Gzip compression is disabled.');
    }

    var bodyParser  = iocContainer.resolve('body-parser').value;
    expressApp.use(bodyParser.urlencoded({ extended: false }));
    expressApp.use(bodyParser.json({limit:(self.mvcxConfig.requestLimitKB)+"kb"}));

    self.logger.info('[mvcx] Standard middleware registration completed.');

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

  function createControllerHashMap(){
    var Hashmap = self.mvcxConfig.hooks.ioc.resolve('hashmap').value;
    var controllers = new Hashmap();

    if(!isEmpty(self.mvcxConfig.routes)){
      self.lazyjs(self.mvcxConfig.routes).each(function(route){
        if(!controllers.has(route.controller)){
          var routeMethods = new Hashmap();
          routeMethods.set(route.method, [route]);
          controllers.set(route.controller, routeMethods);
        }
        else{
          var controllerRoute = controllers.get(route.controller);
          if(!controllerRoute.has(route.method)){
            controllerRoute.set(route.method, [route])
          }
          else{
            var routesArray = controllerRoute.get(route.method);
            routesArray.push(route);
          }
        }
      });
    }

    return controllers;
  }

  function registerControllerAction(method, route, controllerName, actionName){
    var iocContainer = self.mvcxConfig.hooks.ioc;
    var controllerMetadata = iocContainer.resolve(controllerName);

    if(!isEmpty(controllerMetadata[actionName])){
      var path = require('path');
      route = path.join('/', self.mvcxConfig.baseUrlPrefix, '/', route);

      self.logger.info('[mvcx] Registering controller ' + controllerName + '.' + actionName + ' with route ' + route + '...');
      self.expressApp[method](route, function(req, res, next){
        var controller = iocContainer.resolve(controllerName);
        invokeControllerAction(controller[actionName], req, res, next);
      });
    }
  }

  function invokeControllerAction(action, req, res, next){
    try{
      var result = action(req, res, next);
      if(!isEmpty(result) && self.q.isPromise(result)){
        result.then(function(response){
          createSuccessResponse(response, res);
        }).catch(function(e){
          createErrorResponse(e, res);
        });
      }
      else{
        createSuccessResponse(result, res);
      }
    }
    catch(e){
      createErrorResponse(e, res);
    }
  }

  function createSuccessResponse(response, res){
    if(!isEmpty(response)){
      res.status(200);
      res.json(response);
    }
    else{
      res.status(200);
    }
  }

  function createErrorResponse(e, res){
    if(!isEmpty(e)){
      res.status(500);
      res.json({
        errorName: e.name,
        errorMessage: e.message,
        errorStack: e.stack
      });
    }
    else{
      res.status(500);
    }
  }
};
