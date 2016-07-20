module.exports = {
    autoRoutesEnabled: true,

    clusteringEnabled: false,
    compressionEnabled: true,
    requestLimitKB: 5120,
    keepAliveTimeoutSeconds: 30,
    includeErrorStackInResponse: true,

    viewEngine: 'ejs',

    controllerPath: './controllers',
    controllerSuffix: '-controller',
    controllerType: 'mvc',
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
