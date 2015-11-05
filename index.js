module.exports = function(){
  var self = this;

  this.mvcxConfig = null;
  this.expressApp = null;
  this.logger = null;
  this.dependencyResolver = null;

  this.start = function(mvcxConfig, done){
    try{
      console.log('info: [mvcx] Initializing...');
      if(mvcxConfig.clusteringEnabled) {
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
              return initializeCore(mvcxConfig, done);
          }
      }
      else{
          console.log('info: [mvcx] Clustering is disabled.');
          return initializeCore(mvcxConfig, done);
      }
    }
    catch(e){
      done(e, null);
    }
  };

  function initializeCore(mvcxConfig, done){
    try
    {
      var appConfig = null;

      self.mvcxConfig = initializeConfiguration(mvcxConfig);

      self.logger = initializeLogging(mvcxConfig);

      self.dependencyResolver = initializeIoc(mvcxConfig, appConfig);

      self.expressApp = initializeExpress();

      self.logger.info('[mvcx] MVCX intialization completed.');

      done(null, appConfig);
    }
    catch(e){
      console.error('[mvcx] MVCX intialization failed.');
      done(e, null);
    }
  }

  function initializeConfiguration(mvcxConfig){
    if(typeof (mvcxConfig.dependencyResolver) === 'undefined' || mvcxConfig.dependencyResolver == null){
      mvcxConfig.dependencyResolver = require('./DependencyResolver');
    }

    return mvcxConfig;
  }

  function initializeIoc(appConfig){
    var DependencyResolverClass = self.mvcxConfig.dependencyResolver;
    var dependencyResolver = new DependencyResolverClass();

    self.logger.info('[mvcx] Registering dependencies...');

    var express = require('express');
    var expressApp = express();

    dependencyResolver.compose([
      { name: 'config', dependency: appConfig, lifestyle: 'singleton' },
      { name: 'logger', dependency: self.logger, lifestyle: 'singleton' },
      { name: 'q', dependency: require('q'), lifestyle: 'singleton' },
      { name: 'express', dependency: { dep: expressApp }, lifestyle: 'singleton' },
      { name: 'compression', dependency: { dep: require('compression') }, lifestyle: 'singleton' },
      { name: 'body-parser', dependency: { dep: require('body-parser') }, lifestyle: 'singleton' },
      { name: 'http', dependency: require('http'), lifestyle: 'singleton' },
    ]);
    self.logger.info('[mvcx] Dependency registration completed.');

    return dependencyResolver;
  }

  function initializeExpress(){
    self.logger.info('[mvcx] Creating express app...');
    var expressApp = self.dependencyResolver.resolve('express').dep;

    self.logger.info('[mvcx] Registering standard middleware...');

    if(self.mvcxConfig.compressionEnabled){
        var compress = self.dependencyResolver.resolve('compression').dep;
        expressApp.use(compress());
        self.logger.info('[mvcx] Gzip compression is enabled.');
    }
    else{
        self.logger.info('[mvcx] Gzip compression is disabled.');
    }

    var bodyParser  = self.dependencyResolver.resolve('body-parser').dep;
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
