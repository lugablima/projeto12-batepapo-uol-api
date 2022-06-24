import express, { json } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import dayjs from "dayjs";
import joi from "joi";

const participantSchema = joi.object({
  name: joi.string().trim().required(),
});

const messsageSchema = joi.object({
  to: joi.string().trim().required(),
  text: joi.string().trim().required(),
  type: joi.string().trim().valid("message", "private_message").required(),
});

const app = express();

app.use([json(), cors()]);

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

// const participant = { name: "João", lastStatus: 12313123 };
// const message = { from: "João", to: "Todos", text: "oi galera", type: "message", time: "20:04:37" };

mongoClient.connect().then(() => {
  db = mongoClient.db("chatUOL");
});

/* Participants routes */

app.post("/participants", async (req, res) => {
  const body = req.body;

  const validation = participantSchema.validate(body);

  if (validation.error) return res.sendStatus(422);

  try {
    const participant = await db.collection("participants").findOne(body);

    if (participant) return res.sendStatus(409);

    await db.collection("participants").insertOne({ ...body, lastStatus: Date.now() });
    await db.collection("messages").insertOne({
      from: body.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });

    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();

    res.send(participants);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

/* Messages routes */

app.post("/messages", async (req, res) => {
  try {
    const body = req.body;

    const validation = messsageSchema.validate(body);

    const user = req.header("User");

    const userExist = await db.collection("participants").findOne({ name: user });

    if (validation.error || !userExist) return res.sendStatus(422);

    await db.collection("messages").insertOne({ ...body, from: user, time: dayjs().format("HH:mm:ss") });

    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.header("User");
  const limit = parseInt(req.query.limit);

  // const userExist = await db.collection("participants").findOne({ name: user });
  // if(!userExist) return res.sendStatus(422);

  try {
    let messages = await db.collection("messages").find().toArray();

    messages = messages.filter((msg) => {
      let boolean;
      if (msg.type === "message" || msg.type === "status") boolean = true;
      else if (msg.type === "private_message" && (msg.from === user || msg.to === user || msg.to === "Todos"))
        boolean = true;
      else boolean = false;
      return boolean;
    });

    if (!limit) return res.send(messages);

    res.send(messages.slice(limit * -1));
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

/* Status route */

app.post("/status", async (req, res) => {
  try {
    const user = req.header("User");

    const userExist = await db.collection("participants").findOne({ name: user });

    if (!userExist) return res.sendStatus(404);

    await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.listen(5000, () => {
  console.log("O Servidor está rodando em http://localhost:5000");
});
