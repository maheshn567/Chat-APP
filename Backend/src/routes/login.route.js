import express from "express";
import login,{logout} from "../controller/login.controller.js";
import register from "../controller/register.controller.js";
import { validate, loginSchema, registerSchema } from "../Validation/validation.js";

const router = express.Router();

router.post("/login", validate({ body: loginSchema }), login);
router.post("/register", validate({ body: registerSchema }), register);
router.post("/logout",logout);

export default router;