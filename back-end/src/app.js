import express, { json } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
import { MongoClient, ObjectId } from "mongodb";
import dayjs from "dayjs";
import joi from "joi";
import { stripHtml } from "string-strip-html";

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

mongoClient.connect().then(() => {
  db = mongoClient.db("chatUOL");
});

/* Participants routes */

app.post("/participants", async (req, res) => {
  const body = req.body;

  const validation = participantSchema.validate(body);

  if (validation.error) return res.sendStatus(422);

  const name = stripHtml(body.name).result.trim();

  try {
    const participant = await db.collection("participants").findOne({ name });

    if (participant) return res.sendStatus(409);

    await db.collection("participants").insertOne({ name, lastStatus: Date.now() });
    await db.collection("messages").insertOne({
      from: name,
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

    let user = req.header("User");

    user = stripHtml(user).result.trim();

    let participants = await db.collection("participants").find().toArray();

    participants = participants.map((participant) => participant.name);

    const userSchema = joi
      .string()
      .trim()
      .valid(...participants)
      .required();

    const validationUser = userSchema.validate(user);

    if (validation.error || validationUser.error) return res.sendStatus(422);

    for (let prop in body) {
      body[prop] = stripHtml(body[prop]).result.trim();
    }

    await db.collection("messages").insertOne({ ...body, from: user, time: dayjs().format("HH:mm:ss") });

    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  try {
    let user = req.header("User");
    const limit = Number(req.query.limit);

    user = stripHtml(user).result.trim();

    let participants = await db.collection("participants").find().toArray();

    participants = participants.map((participant) => participant.name);

    const userSchema = joi
      .string()
      .trim()
      .valid(...participants)
      .required();

    const validationUser = userSchema.validate(user);

    if (validationUser.error) return res.sendStatus(422);

    let messages = await db.collection("messages").find().toArray();

    messages = messages.filter((msg) => {
      let boolean;
      if (msg.type === "message" || msg.type === "status") boolean = true;
      else if (msg.type === "private_message" && (msg.from === user || msg.to === user || msg.to === "Todos"))
        boolean = true;
      else boolean = false;
      return boolean;
    });

    if (!limit || limit % 1 !== 0) return res.send(messages);

    res.send(messages.slice(parseInt(limit) * -1));
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.delete("/messages/:id", async (req, res) => {
  try {
    let user = req.header("User");
    user = stripHtml(user).result.trim();
    const id = req.params.id;

    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });

    if (!message) return res.sendStatus(404);

    const userExist = await db.collection("participants").findOne({ name: user });

    if (!userExist) return res.sendStatus(422);

    if (message.from !== user) return res.sendStatus(401);

    await db.collection("messages").deleteOne({ _id: message._id });

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.put("/messages/:id", async (req, res) => {
  try {
    const body = req.body;
    let user = req.header("User");
    user = stripHtml(user).result.trim();
    const id = req.params.id;

    const validationBody = messsageSchema.validate(body);

    let participants = await db.collection("participants").find().toArray();

    participants = participants.map((participant) => participant.name);

    const userSchema = joi
      .string()
      .trim()
      .valid(...participants)
      .required();

    const validationUser = userSchema.validate(user);

    if (validationBody.error || validationUser.error) return res.sendStatus(422);

    const message = await db.collection("messages").findOne({ _id: new ObjectId(id) });

    if (!message) return res.sendStatus(404);

    if (message.from !== user) return res.sendStatus(401);

    for (let prop in body) {
      body[prop] = stripHtml(body[prop]).result.trim();
    }

    await db
      .collection("messages")
      .updateOne({ _id: message._id }, { $set: { ...body, from: user, time: dayjs().format("HH:mm:ss") } });

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

/* Status route */

app.post("/status", async (req, res) => {
  try {
    let user = req.header("User");

    user = stripHtml(user).result.trim();

    const userExist = await db.collection("participants").findOne({ name: user });

    if (!userExist) return res.sendStatus(404);

    await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

/* Automatic removal of inactive users */

const TIME_10_SEC = 10 * 1000;
const TIME_15_SEC = 15 * 1000;

setInterval(async () => {
  try {
    let inactiveUsers = await db
      .collection("participants")
      .find({ lastStatus: { $lt: Date.now() - TIME_10_SEC } })
      .toArray();

    if (inactiveUsers.length === 0) return;

    inactiveUsers = inactiveUsers.map((user) => user.name);

    await db.collection("participants").deleteMany({ name: { $in: inactiveUsers } });

    const messageLeavesTheRoom = { to: "Todos", text: "sai da sala...", type: "status" };

    inactiveUsers = inactiveUsers.map((name) => ({
      ...messageLeavesTheRoom,
      from: name,
      time: dayjs().format("HH:mm:ss"),
    }));

    await db.collection("messages").insertMany(inactiveUsers);
  } catch (error) {
    console.log(error);
  }
}, TIME_15_SEC);

app.listen(5000, () => {
  console.log("O Servidor está rodando em http://localhost:5000");
});
