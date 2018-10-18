import * as grpc from "grpc";
import * as path from "path";
import { createServer } from "../jrpc/server";

const getUsername: grpc.handleUnaryCall<
    { userId: string },
    { name: string }
> = (call, callback) => {
    console.log(call.request);
    console.log(`Requester userId ${call.request.userId}`);

    callback(null, { name: "Alex" });
};

const protosPath = path.join(__dirname, `../../src/server`);

const getProtoPath = (uri: string) => path.join(protosPath, "protos", uri);

const protos = {
    TestService: {
        uri: "test.proto",
        file: getProtoPath("test.proto"),
        service: ["jrpc", "test", "TestService"],
        testCalls: {
            getUsername: {
                userId: "test"
            }
        }
    }
};

const server = createServer({
    host: "0.0.0.0",
    grpcPort: 49000,
    expressPort: 49001,
    protos,
    implementation: {
        TestService: { getUsername }
    }
});

server.start();
