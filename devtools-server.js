var http = require("http"),
    fs = require("fs"),
    io = require('socket.io'),
    exec = require('child_process').exec,
    _ = require('lodash'),
    path = require("path");

var server = function () {
    var packagePath = path.join(process.cwd(), "package.json");
    var package = require(packagePath);
    var tasks = Object.keys(package.scripts).sort();

    if (tasks && tasks.length > 0) {
        process.stdout.write("npm scripts loaded ，please open chrome devtools -> npm scripts\n");
    } else {
        process.stdout.write("could not load npm tasks\n");
    }

    var server = http.createServer(function (request, response) {});

    server.listen(9090);

    var sio = io.listen(server);
    var workers = [];

    sio.sockets.on('connection', function (socket) {

        socket.emit('onNpmTasksLoaded', {
            'tasks': tasks
        });

        // kill task
        socket.on('killTask', function (data) {
            _.each(workers, function (worker) {
                if (worker.pid === data.pid) {
                    worker.kill();
                }
            });
            workers = _.remove(workers, function (worker) {
                return worker.pid !== data.pid;
            });
        });

        // run the task
        socket.on('runTask', function (data) {

            process.stdout.write("running task: " + data.taskName + "\n");

            var currentTask = data.taskName;

            // 开启对应子任务
            var worker = exec(package.scripts[data.taskName]); //每次run 都是一个函数，都是一个独立的worker
            workers.push(worker);

            // 通过 socket 输出子任务log
            worker.stdout.setEncoding('utf-8');
            worker.stdout.on('data',function (data) {
                if (data) {
                    var eventData = {
                        'message': data + '\n',
                        'pid': worker.pid   //用闭包外的worker
                    };
                    if(currentTask && currentTask !== ""){
                        eventData.taskName = currentTask;
                    }
                    socket.emit('onTaskRunning', eventData);
                }

            });

            //when task end
            worker.stdout.on('end', function (data) {
                socket.emit('onTaskFinish', {
                    'message': worker.pid + " process completed",
                    'pid': worker.pid
                });
            });

            //when taks error
            worker.stderr.on('data', function (data) {
                if (data) {
                    socket.emit('onTaskError', {
                        'message': "",
                        'pid': worker.pid
                    });
                }
            });

            //when task exits
            worker.on('exit', function (code) {
                if (code !== 0) {
                    socket.emit('onTaskExit', {
                        'message': worker.pid + '|' + 'Process Exited with code: ' + code,
                        'pid': worker.pid
                    });
                }
            });
        });
    });
};

exports.run = server;
