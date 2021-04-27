const gulp = require('gulp');
const { src, dest, series, parallel, watch } = require('gulp');
const uglify = require('gulp-uglify');
const gulpif = require('gulp-if');
const cleanCSS = require('gulp-clean-css');
const del = require('delete');
const browserSync = require('browser-sync').create();
const reload = browserSync.reload;
const { createProxyMiddleware } = require('http-proxy-middleware');

const concat = require('gulp-concat');
const { rollup } = require('rollup');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('rollup-plugin-terser').terser;
const babel = require('@rollup/plugin-babel').default;

const production = process.env.NODE_ENV === 'production' ? true : false;

const uglifyOptions = {
    compress: {
        drop_console: true
    }
}

// babel config
const babelConfig = {
    compact:false,
    babelHelpers: 'bundled',
    exclude: 'node_modules/**', // Only compile our source code
    plugins: [
    ],
    presets: [
        ['@babel/preset-env', {
            useBuiltIns: 'usage',
            corejs: 3,
            targets: {
                chrome: 58,
                ie: 11
            }
        }]
    ]
};

// file handler paths
const paths = {
    // html 文件
    staticHtml: ['src/*.html'],
    /** 除了css 外的所有静态资源 */
    staticAssets: ['src/assets/**', '!src/assets/**/*.css'],
    /** demo 脚本 */
    staticDemoData: ['src/demoData/*.js'],

    // static resources dest
    destStaticHtml: ['dist'],
    destStaticAssets: ['dist/assets'],
    destStaticDemoData: ['dist/demoData'],

    //core es module
    core: ['src/**/*.js','!src/demoData/*.js','!src/plugins/js/*.js'],
    // 框架自有样式
    mainStyle:['src/assets/styles/*.css','node_modules/flatpickr/dist/themes/light.css'],
    mainStyleDest: ['dist/assets/styles'],

    // 插件样式
    pluginsStyle: ['src/assets/plugins/*.css'],
    pluginsStyleDest: ['dist/assets/plugins'],
    // 插件集合
    pluginsJs:[
        'node_modules/jquery/dist/jquery.min.js',
        'src/plugins/spectrum.min.js',
        'src/plugins/jquery-ui.min.js',
        'src/plugins/jquery.mousewheel.min.js',
        'src/plugins/jstat.min.js',
        'src/plugins/jquery.sPage.min.js',
        'src/plugins/crypto-api.min.js'
    ],
    pluginsJsDest: ['dist/plugins'],
    // Package directory
    dist: 'dist',
};

// Clear the dist directory
function clean() {
    return del([paths.dist]);
}

// proxy middleware
const apiProxy = createProxyMiddleware('/luckysheet/', {
    target: 'http://luckysheet.lashuju.com/', // set your server address
    changeOrigin: true, // for vhosted sites
    ws: true, // proxy websockets
});

// Static server
function serve(done) {
    browserSync.init({
        server: {
            baseDir: paths.dist,
            middleware: [apiProxy],//proxy
        },
        ghostMode: false, //默认true，滚动和表单在任何设备上输入将被镜像到所有设备里，会影响本地的协同编辑消息，故关闭
    }, done)
}

// Monitoring file changes
function watcher(done) {
    watch(paths.core, { delay: 500 }, series(core, reloadBrowser));

    // watch plugins and css
    watch(paths.mainStyle,{ delay: 500 }, series(mainStyle, reloadBrowser));
    watch(paths.pluginsStyle,{ delay: 500 }, series(pluginsStyle, reloadBrowser));
    watch(paths.pluginsJs,{ delay: 500 }, series(pluginsJs, reloadBrowser));

    // watch static
    watch(paths.staticHtml,{ delay: 500 }, series(copyStaticHtml, reloadBrowser));
    watch(paths.staticAssets,{ delay: 500 }, series(copyStaticAssets, reloadBrowser));
    watch(paths.staticDemoData,{ delay: 500 }, series(copyStaticDemoData, reloadBrowser));
    done();
}

// Refresh browser
function reloadBrowser(done) {
    reload();
    done();
}

/**
 * 核心代码构建
 */
async function core() {
    const bundle = await rollup({
        input: 'src/index.js',
        plugins: [
            nodeResolve(), // tells Rollup how to find date-fns in node_modules
            commonjs(), // converts date-fns to ES modules
            production && terser(), // minify, but only in production
            babel(babelConfig)
        ],
    });

    bundle.write({
        file: 'dist/luckysheet.umd.js',
        format: 'umd',
        name: 'luckysheet',
        sourcemap: true,
        inlineDynamicImports:true,

    });

    if(production){
        bundle.write({
            file: 'dist/luckysheet.esm.js',
            format: 'esm',
            name: 'luckysheet',
            sourcemap: true,
            inlineDynamicImports:true,
        });
    }

}

/**
 * 整合插件代码
 * @returns 
 */
function pluginsJs() {
    return  src(paths.pluginsJs)
        .pipe(concat('index.js'))
        .pipe(gulpif(production, uglify(uglifyOptions)))
        .pipe(dest(paths.pluginsJsDest));
}

/**
 * 处理框架自有样式
 * @returns 
 */
 function mainStyle() {
    return  src(paths.mainStyle)
        .pipe(concat('index.css'))
        .pipe(gulpif(production, cleanCSS()))
        .pipe(dest(paths.mainStyleDest));
}

/**
 * 处理插件样式
 * @returns
 */
function pluginsStyle() {
    return src(paths.pluginsStyle)
        .pipe(concat('index.css'))
        .pipe(gulpif(production, cleanCSS()))
        .pipe(dest(paths.pluginsStyleDest));
}



/**
 * 拷贝文件
 * @returns
 */
const copy = parallel(copyStaticHtml, copyStaticAssets, copyStaticDemoData);
function copyStaticHtml(){
    return src(paths.staticHtml)
        .pipe(dest(paths.destStaticHtml));
}
function copyStaticAssets(){
    return src(paths.staticAssets)
        .pipe(dest(paths.destStaticAssets));
}
function copyStaticDemoData(){
    return src(paths.staticDemoData)
        .pipe(dest(paths.destStaticDemoData));
}





const dev = series(
    clean,
    parallel(
        copy,
        mainStyle,
        pluginsStyle,
        pluginsJs, 
        core
    ),
    watcher,
    serve
);
const build = series(
    clean, 
    parallel(
        copyStaticAssets,
        mainStyle,
        pluginsStyle,
        pluginsJs, 
        core
    )
);

exports.dev = dev;
exports.build = build;
exports.default = dev;