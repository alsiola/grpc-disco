import * as path from "path";
import * as grpc from "grpc";
import axios, { AxiosResponse } from "axios";
import * as fs from "fs-extra";
import * as loadProto from "@grpc/proto-loader";

const getBase = (base: string) => (
    u: string,
    port: number
): Promise<AxiosResponse<any>> =>
    axios.get(`${base}:${port}/${u}`).catch(() => getBase(base)(u, port));

type CallbackFn<T, U> = (a: T, cb: (err: any, result: U) => void) => void;

type CallbackService = Record<string, CallbackFn<any, any>>;

type PromiseService<T extends CallbackService> = {
    [K in keyof T]: T[K] extends CallbackFn<infer A, infer B>
        ? (a: A) => Promise<B>
        : never
};

const promisify = <T extends CallbackService>(
    service: T,
    methods: string[]
): PromiseService<T> => {
    return methods.reduce(
        (out, method) => ({
            ...out,
            [method]: (a: any) =>
                new Promise((resolve, reject) => {
                    service[method](a, (err, result) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(result);
                    });
                })
        }),
        {} as any
    );
};

const validateService = async (
    name: string,
    testCalls: any,
    protoService: any,
    validators: Record<string, Record<string, (a: any) => boolean>>
) => {
    if ((validators as any)[name]) {
        console.log(`Testing ${name} for compatibility`);
        await Promise.all(
            Object.entries(testCalls)
                .filter(([call]) => !!validators[name][call])
                .map(([call, args]) => {
                    console.log(`Testing ${name}.${call}: Making GRPC call`);
                    return new Promise((resolve, reject) =>
                        protoService[call](args, (err: any, result: any) => {
                            if (err) {
                                console.log(
                                    `Testing ${name}.${call}: returned an error`
                                );
                                return reject(err);
                            }
                            console.log(
                                `Testing ${name}.${call}: validating result`
                            );
                            if (!validators[name][call](result)) {
                                console.log(
                                    `Testing ${name}.${call}: result is invalid`
                                );
                                return reject(
                                    `${name} does not fulfil required interface`
                                );
                            }
                            console.log(`Testing ${name}.${call}: valid!`);
                            resolve();
                        })
                    );
                })
        );
    }
};

interface Server {
    host: string;
    expressPort: number;
    grpcPort: number;
}

interface ClientOpts {
    validators: Record<string, Record<string, (a: any) => boolean>>;
    servers: Server[];
}

export const createClients = async <T>({
    servers,
    validators
}: ClientOpts): Promise<T> => {
    const servicesArray = await Promise.all(
        servers.map(async ({ host, expressPort, grpcPort }) => {
            const get = getBase(host);
            console.log("Initialising GRPC client...");
            console.log("Fetching available protos");
            const availableProtos = await get("protos", expressPort);

            console.log("Creating services");
            const services = await Object.entries<any>(
                availableProtos.data
            ).reduce(async (out, [name, { uri, service, testCalls }]) => {
                console.log(`Creating ${name}`);
                const prev = await out;
                console.log(`Creating ${name}: Fetching proto`);
                const protoResponse = await get(`protos/${uri}`, expressPort);

                const tempPath = path.join(__dirname, "temp", `${name}.proto`);

                await fs.mkdirp(path.join(__dirname, "temp"));

                console.log(`Creating ${name}: Saving proto locally`);
                fs.writeFileSync(tempPath, protoResponse.data);

                console.log(`Creating ${name}: Loading package definition`);
                const proto = loadProto.loadSync(tempPath);

                const protoDescriptor = grpc.loadPackageDefinition(proto);

                const serviceMethods = Object.values(
                    (protoDescriptor as any).jrpc.test.TestService.service
                ).map(({ originalName }: any) => originalName);

                const protoConstructor = service.reduce(
                    (out: any, curr: any) => out[curr],
                    protoDescriptor
                );

                console.log(`Creating ${name}: Creating service`);
                const protoService = new protoConstructor(
                    `0.0.0.0:${grpcPort}`,
                    grpc.credentials.createInsecure()
                );

                await validateService(
                    name,
                    testCalls,
                    protoService,
                    validators
                );

                return {
                    ...(prev as any),
                    [name]: promisify(protoService, serviceMethods)
                };
            }, Promise.resolve({} as T));

            return services;
        })
    );

    console.log(`Initialised ${servicesArray.length} services successfully`);

    return servicesArray.reduce(
        (out, curr) => ({
            ...out,
            ...curr
        }),
        {}
    );
};
