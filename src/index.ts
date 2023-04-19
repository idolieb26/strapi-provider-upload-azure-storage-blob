import { DefaultAzureCredential } from "@azure/identity";
import {
  AnonymousCredential,
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";

type StorageBlobConfig = {
  tenant: string;
  client: string;
  secret: string;
  account: string;
  accountKey: string;
  containerName: string;
  connectionString: string;
  sasToken: string;
  serviceBaseURL: string;
  defaultPath: string;
};

type StrapiFile = File & {
  path: string;
  url: string;
  hash: string;
  ext: string;
  buffer: string;
  mime: string;
};

const trimParam = (str: any) =>
  typeof str === "string" ? str.trim() : undefined;

// A helper method used to read a Node.js readable stream into a Buffer
async function streamToBuffer(
  readableStream: NodeJS.ReadableStream
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data: Buffer | string) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on("error", reject);
  });
}

const createClient = (config: StorageBlobConfig) => {
  const account = <string>trimParam(config.account);
  const accountKey = <string>trimParam(config.accountKey);
  const connStr = trimParam(config.connectionString);

  const tenant = <string>trimParam(config.tenant);
  const client = <string>trimParam(config.client);
  const secret = <string>trimParam(config.secret);

  const sasToken = <string>trimParam(config.sasToken);

  const serviceBaseURL =
    trimParam(config.serviceBaseURL) ||
    `https://${account}.blob.core.windows.net`;

  if (tenant && client && secret && account) {
    //Azure Active Directory
    const defaultCredential = new DefaultAzureCredential();
    return new BlobServiceClient(serviceBaseURL, defaultCredential);
  } else if (sasToken) {
    const anonymousCredential = new AnonymousCredential();
    return new BlobServiceClient(
      `${serviceBaseURL}${sasToken}`,
      anonymousCredential
    );
  } else if (connStr) {
    return BlobServiceClient.fromConnectionString(connStr);
  } else if (account && accountKey) {
    const sharedKeyCredential = new StorageSharedKeyCredential(
      account,
      accountKey
    );
    return new BlobServiceClient(serviceBaseURL, sharedKeyCredential);
  } else {
    throw new Error(
      "Error in configuration, please be sure to configure the Azure account and accountKey or the connectionString."
    );
  }
};

module.exports = {
  provider: "azure-storage-blob",
  auth: {
    tenant: {
      label: "Azure Tenant Id",
      type: "text",
    },
    client: {
      label: "Azure Client Id",
      type: "text",
    },
    secret: {
      label: "Azure Client Secret",
      type: "text",
    },
    account: {
      label: "Account Name",
      type: "text",
    },
    accountKey: {
      label: "Secret Access Key",
      type: "text",
    },
    connectionString: {
      label: "Connection String",
      type: "text",
    },
    containerName: {
      label: "Container name",
      type: "text",
    },
    sasToken: {
      label: "SAS Token",
      type: "text",
    },
    defaultPath: {
      label: "The path to use when there is none being specified",
      type: "text",
    },
  },

  init: (config: StorageBlobConfig) => {
    const defaultPath = trimParam(config.defaultPath) || "assets";
    const containerName = <string>trimParam(config.containerName);

    const client = <BlobServiceClient>createClient(config);

    return {
      uploadStream(file: StrapiFile, customParams = {}) {
        return new Promise<void>(async (resolve, reject) => {
          try {
            const containerClient = client.getContainerClient(containerName);
            // check if the file name exists
            let fileName = file.name;
            let blobs = containerClient.listBlobsFlat();
            for await (const blob of blobs) {
              const blobName = blob.name.split('/').pop();
              if (blobName == file.name) {
                const fileExt = fileName.split('.').pop() as string;
                fileName = `${file.hash}.${fileExt}`;
                break;
              }
            }

            // create blobClient for container
            const blobClient = containerClient.getBlockBlobClient(
              `${defaultPath}/${fileName}`
            );
            // set mimetype as determined from browser with file upload control
            const options = {
              blobHTTPHeaders: { blobContentType: file.mime, ...customParams },
              metadata: { originalName: file.name }
            };

            // convert stream to buffer
            const bufferedStream = await streamToBuffer(file.stream as any);
            // upload file
            await blobClient.uploadData(bufferedStream, options);
            // console.log(result)
            file.url = blobClient.url;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
      upload(file: StrapiFile, customParams = {}) {
        return new Promise<void>(async (resolve, reject) => {
          try {
            const containerClient = client.getContainerClient(containerName);

            // check if the file name exists
            let fileName = file.name;
            let blobs = containerClient.listBlobsFlat();
            for await (const blob of blobs) {
              const blobName = blob.name.split('/').pop();
              if (blobName == file.name) {
                const fileExt = fileName.split('.').pop() as string;
                fileName = `${file.hash}.${fileExt}`;
                break;
              }
            }

            // create blobClient for container
            const blobClient = containerClient.getBlockBlobClient(
              `${defaultPath}/${fileName}`
            );

            // set mimetype as determined from browser with file upload control
            const options = {
              blobHTTPHeaders: { blobContentType: file.mime, ...customParams },
              metadata: { originalName: file.name }
            };

            // upload file
            await blobClient.uploadData(file, options);

            file.url = blobClient.url;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
      delete(file: StrapiFile, customParams = {}) {
        return new Promise<void>(async (resolve, reject) => {
          try {
            const containerClient = client.getContainerClient(containerName);

            // create blobClient for container
            const blobClient = containerClient.getBlobClient(
              `${defaultPath}/${file.name}`
            );

            await blobClient.delete();
            file.url = blobClient.url;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      },
    };
  },
};