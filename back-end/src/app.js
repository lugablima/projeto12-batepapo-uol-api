import express, { json } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();

app.use([json(), cors()]);

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("chatUOL");
});

app.listen(5000, () => {
  console.log("O Servidor está rodando em http://localhost:5000");
});
