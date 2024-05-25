const { ApolloServer, gql } = require('apollo-server-express'); // Use apollo-server-express for express integration
const { graphqlUploadExpress, GraphQLUpload } = require('graphql-upload');
const express = require('express');
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { finished } = require('stream/promises');
const fs = require('fs');
const path = require('path');
const { ApolloServerPluginLandingPageGraphQLPlayground } = require('apollo-server-core');

const prisma = new PrismaClient();

const typeDefs = gql`
  scalar Upload

  type Employee {
    id: ID!
    firstName: String!
    lastName: String!
    nationality: String!
    salary: Float!
    joiningDate: String!
    address: String!
  }

  type Query {
    employees:[Employee]
  }

  type Mutation {
    uploadEmployees(file: Upload!): String!
  }
`;

const resolvers = {
  Upload: GraphQLUpload,
  Query: {
    employees: async () => await prisma.employee.findMany(),
  },
  

  Mutation: {
    uploadEmployees: async (_, { file }) => {
      const { createReadStream, filename } = await file;
      const stream = createReadStream();
      const filePath = path.join(__dirname, 'uploads', filename);

      // Ensure the uploads directory exists
      fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

      // Save the file locally
      const out = fs.createWriteStream(filePath);
      stream.pipe(out);
      await finished(out);

      // Read the Excel file
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_json(sheet);

      // Insert data into the database using Prisma
      for (const employee of data) {
        await prisma.employee.create({
          data: {
            firstName: employee['firstName'],
            lastName: employee['lastName'],
            nationality: employee['nationality'],
            salary: parseFloat(employee['salary']),
            joiningDate: new Date(employee['joiningDate']),
            address: employee['address'],
          },
        });
      }

      // Remove the file after processing
    //   fs.unlinkSync(filePath);

      return `Uploaded ${data.length} employees from file ${filename} ${filePath}`;
    },
  }
};

const app = express();
app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 1 })); // Adjust limits if necessary

const server = new ApolloServer({
  typeDefs,
  resolvers,
//   plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],
  context: ({ req }) => ({ req })
});

async function startServer() {
  await server.start();
  server.applyMiddleware({ app, path: '/graphql' });

  app.listen({ port: 4000 }, () => {
    console.log(`Server ready at http://localhost:4000/graphql`);
  });
}

startServer();
