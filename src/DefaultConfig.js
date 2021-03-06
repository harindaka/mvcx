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
    requestSchemaSuffix: '-request',
    baseUrlPrefix: '',
    routes: null,
    requestModelMergeOrder: [
        'query', 'params', 'body'
    ],
    schemaValidation: {
        request: {
            //Ajv options http://epoberezkin.github.io/ajv/#options
            allErrors: false,
            format: 'fast',
            formats: {}
        }
    },

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
