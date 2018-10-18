import * as t from "io-ts";
import { createClients } from "../jrpc/client";

interface Services {
    TestService: {
        getUsername: (
            { userId }: { userId: string }
        ) => Promise<t.TypeOf<typeof getUsernameResponse>>;
    };
}

const getUsernameResponse = t.interface({
    name: t.string
});

const validators = {
    TestService: {
        getUsername: (candidate: any) =>
            getUsernameResponse.decode(candidate).isRight()
    }
};

createClients<Services>({
    servers: [
        {
            host: "http://localhost",
            expressPort: 49001,
            grpcPort: 49000
        }
    ],
    validators
})
    .then(({ TestService }) => {
        return TestService.getUsername({ userId: "test " }).then(console.log);
    })
    .catch(console.error);
