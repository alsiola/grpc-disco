import * as grpc from "grpc";
import express from "express";
import * as loadProto from "@grpc/proto-loader";
import * as fs from "fs";

type Protos = Record<string, Proto<any>>;

interface Proto<T> {
    uri: string;
    service: string[];
    file: string;
    testCalls: Record<string, Record<string, any>>;
}

type Implementation = Record<string, Record<string, any>>;

export interface JRPCOpts {
    host: string;
    grpcPort: number;
    expressPort: number;
    protos: Protos;
    implementation: Implementation;
    credentials: grpc.ServerCredentials;
}

export const createServer = (opts: JRPCOpts) => {
    const grpcServer = createGRPCServer(opts);
    const expressServer = createExpressServer(opts);

    return {
        start: () => {
            grpcServer.start();
            expressServer.listen(opts.expressPort, () => {
                console.log(`GRPC server listening on ${opts.grpcPort}`);
                console.log(`Express server listening on ${opts.expressPort}`);
            });
        }
    };
};

const createGRPCServer = ({
    host,
    grpcPort,
    protos,
    implementation,
    credentials
}: JRPCOpts) => {
    const server = new grpc.Server();

    Object.entries(protos).forEach(([name, { service, file }]) => {
        const testProto = loadProto.loadSync(file, {
            keepCase: true
        });

        server.addService(
            testProto[service.join(".")] as any,
            implementation[name]
        );
    });

    server.bind(`${host}:${grpcPort}`, credentials);

    return server;
};

const createExpressServer = ({ protos }: JRPCOpts) => {
    const app = express();

    app.get("/protos", (req, res) => res.send(protos));

    Object.values(protos).forEach(({ file, uri }) => {
        app.get(`/protos/${uri}`, (req, res) =>
            fs.readFile(file, (err, file) => res.send(file))
        );
    });

    app.use((req, res) => res.send(req.url));

    return app;
};
