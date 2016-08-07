var http = require("http"),
    fs = require("fs"),
    io = require('socket.io'),
    exec = require('child_process').exec,
    _ = require('lodash'),
    path = require("path");

var server = function () {
    var packagePath = path.join(process.cwd(), "package.json");
    var package = require(packagePath);
    var tasks = Object.keys(package.scripts);

    if (tasks && tasks.length > 0) {
        process.stdout.write("npm scripts loaded, please open chrome devtools in tasks panel\n");
    } else {
        process.stdout.write("could not load npm tasks\n");
    }

    var server = http.createServer(function (request, response) {});

    server.listen(9090);

    var sio = io.listen(server);
    var workers = [];

    //turn off debug
    sio.set('log level', 1);

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

            process.stdout.write('任务: ' + data.taskName + " start running" + "\n");

            var taskName = data.taskName;

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
                    if(taskName && taskName !== ""){
                        eventData.taskName = taskName;
                    }
                    socket.emit('onTaskRunning', eventData);
                }

            });

            //when task end
            worker.stdout.on('end', function (data) {
                var message = '任务: ' +  taskName + " task completed";

                process.stdout.write(message+ "\n");
                socket.emit('onTaskFinish', {
                    'message': message,
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
                    var message = '任务: ' + taskName + ' task exited';

                    process.stdout.write(message+ "\n");
                    socket.emit('onTaskExit', {
                        'message': message,
                        'pid': worker.pid
                    });
                }
            });
        });
    });
};

exports.run = server;
