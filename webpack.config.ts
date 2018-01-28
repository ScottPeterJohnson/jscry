const webpack = require('webpack');
const path = require('path');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');

const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");

const isDebug = process.env.NODE_ENV !== "production";

interface BuildUnitOptions {
    entryName: string,
    entryPoint: string,
    folder: string,
	prodFolder?: string,
    noProd?: boolean,
    noVendorChunkInDebug?: boolean,
    vendorChunkInProd?: boolean
    noMinSuffix?: boolean
}

function baseConfig(options : BuildUnitOptions) : any|null {
	function minSuffix() {
		return (isDebug || options.noMinSuffix) ? '' : '-min'
	}
	function folder(options : BuildUnitOptions){
		return !isDebug && options.prodFolder ? options.prodFolder : options.folder;
	}

    if(options.noProd && !isDebug){ return null; }

	const babelLoader = {
		loader: "babel-loader",
		options: {
			cacheDirectory: true,
			plugins: ["transform-runtime"]
		}
	};

	return {
        cache: true,
        entry: {
            [options.entryName + minSuffix()] : options.entryPoint
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'build/generated-resources/', folder(options) || ""),
            jsonpFunction: options.entryName.replace("-", "_") + "_jsonp",
            chunkFilename: '[chunkhash].js'
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: [/node_modules/],
                    use: [ 'cache-loader', babelLoader ]
                },
                {
                    test: /\.tsx?$/,
                    exclude: [/node_modules/],
                    use: [
                        { loader: 'cache-loader' },
                        {
                            loader: 'thread-loader',
                            options: {
                                workers: require('os').cpus().length - 1,
                            },
                        },
                        babelLoader,
                        {
                            loader: 'ts-loader',
                            options: {
                                happyPackMode: true,
                                silent: true
                            }
                        }
                    ]
                },
                {
                    test: /\.scss$/,
                    use: [
                        'cache-loader',
                        'style-loader',
                        'css-loader',
                        {loader: 'sass-loader', options: {includePaths: ["node_modules"]}}
                    ]
                },
                {
                    test: /\.css/,
                    use: [
                        'cache-loader',
                        'style-loader',
                        {
                            loader: 'css-loader',
                            options: {module: false}
                        }
                    ]
                },
                {
                    test: /\.json$/,
                    use: ['cache-loader', 'json-loader']
                }
            ]
        },
        resolve: {
            modules: [path.resolve(__dirname, "src/main/typescript"), "node_modules", "build/tsgen"],
            extensions: [".tsx", ".ts", ".js", ".css", ".scss", ".json"]
        },
        plugins: [
            new ForkTsCheckerWebpackPlugin({watch: ["src/main/typescript"]}),
            new webpack.DefinePlugin({
                DEBUG: isDebug
            }),
            ((!options.noVendorChunkInDebug && isDebug) || options.vendorChunkInProd) ? new webpack.optimize.CommonsChunkPlugin({
                name: 'vendor-' + options.entryName + minSuffix(),
                chunks: [options.entryName + minSuffix()],
                minChunks: function(module : any) {
                    return module.context && module.context.indexOf('node_modules') !== -1;
                }
            }) : function(){},
            new webpack.SourceMapDevToolPlugin({
                filename: '[name]' + '.js.map',
                exclude: ['vendor-' + options.entryName + minSuffix() + '.js']
            }),
            new webpack.DefinePlugin({
                __DEBUG__: JSON.stringify(isDebug),
                'process.env': {
                    NODE_ENV: JSON.stringify(isDebug ? 'dev' : 'production')
                }
            }),
            isDebug ? function () {
            } : new UglifyJsPlugin({
                sourceMap: true,
                uglifyOptions: {
					compress: {
						drop_debugger: false,
					}
                },
            })
        ]
    };
}

const webExtensionBase = {
	folder: "webextension",
	prodFolder: "webextension/prod",
	noMinSuffix: true,
	noVendorChunkInDebug: true
};

//noinspection JSUnresolvedFunction
module.exports = [
    baseConfig({
        entryName: "jscry-web",
        entryPoint: "./src/main/typescript/webembed/WebEmbedding.ts",
        folder: "static/web"
    }),
    baseConfig({
        entryName: "server-embed",
        entryPoint: "./src/main/typescript/serverside/ServerMapping.ts",
        noProd: true,
        folder: "serverjs"
    }),
    baseConfig({
        entryName: "console-app",
        entryPoint: "./src/main/typescript/console/ConsoleApp.tsx",
        vendorChunkInProd: true,
        folder: "static/console"
    }),
    baseConfig({
        entryName: "frontpage",
        entryPoint: "./src/main/typescript/frontpage/FrontPage.tsx",
        vendorChunkInProd: true,
        folder: "static/frontpage"
    }),
    /*baseConfig({
        entryName: "test-sourcemap",
        entryPoint: "./src/main/typescript/test/TestSourceMap.ts",
        noProd: true,
        folder: "static/web"
    }),*/
    baseConfig({
        entryName: "injector",
        entryPoint: "./src/main/typescript/webextension/Injector.ts",
        ...webExtensionBase
    }),
    baseConfig({
        entryName: "settings",
        entryPoint: "./src/main/typescript/webextension/SettingsPage.tsx",
        ...webExtensionBase
    }),
    baseConfig({
        entryName: "popup",
        entryPoint: "./src/main/typescript/webextension/Popup.tsx",
        ...webExtensionBase
    }),
    baseConfig({
        entryName: "background",
        entryPoint: "./src/main/typescript/webextension/Background.ts",
        ...webExtensionBase
    })
].filter((it) => it !== null);