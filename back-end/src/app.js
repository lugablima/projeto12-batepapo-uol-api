import express, { json } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use([json(), cors()]);

app.listen(5000, () => {
  console.log("O Servidor está rodando em http://localhost:5000");
});
