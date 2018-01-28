/**
 * A tiny bit of loading for the scratchpad (npm run scratchpad)
 */
var path = require('path');
var webpack = require("webpack");

//noinspection JSUnresolvedFunction
module.exports = {
    cache: true,
    entry: {
        ["scratchpad"]: './src/main/typescript/Scratchpad.ts',
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'build/scratchpad')
    },
    devServer: {
        contentBase: [path.join(__dirname, "build/scratchpad"), path.join(__dirname, "src/main/resources/static/scratchpad")],
        port: 9000,
        lazy: true
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel-loader'
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'babel-loader',
                        query: {
                            cacheDirectory: true,
                            plugins: ['transform-runtime']
                        }
                    },
                    {
                        loader: 'ts-loader'
                    }
                ]
            },
            {
                test: /\.scss$/,
                use: [
                    'style-loader',
                    'css-loader',
                    {loader: 'sass-loader', options: {includePaths: ["node_modules"]}}
                ]
            },
            {
                test: /androidstudio\.css/,
                use: [
                    'style-loader',
                    {
                        loader:'css-loader',
                        options: { module: false }
                    }
                ]
            },
            {
                test: /\.css$/,
                exclude: /androidstudio\.css/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            importLoaders: 1,
                            sourceMap: true,
                            modules: true
                        }
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            sourceMap: true,
                            sourceComments: true,
                            plugins: function () {
                                return [require("postcss-cssnext")]
                            }
                        }
                    }
                ]
            },
            {
                test: /\.json$/,
                use: 'json-loader'
            }
        ]
    },
    resolve: {
        modules: [path.resolve(__dirname, "src/main/typescript"), "node_modules", "build/tsgen"],
        extensions: [".tsx", ".ts", ".js", ".css", ".scss", ".json"]
    },
    plugins: [
        new webpack.optimize.CommonsChunkPlugin({
            name: 'scratchpad-vendor',
            chunks: ["scratchpad"],
            minChunks: function (module) {
                return module.context && module.context.indexOf('node_modules') !== -1;
            }
        }),
        new webpack.SourceMapDevToolPlugin({
            filename: '[name].js.map',
            exclude: 'scratchpad-vendor' + '.js'
        })
    ]
};