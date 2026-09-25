import getMe,{getAllUser} from "../controller/getMe.controller.js"
import authMiddleware from "../middleware/authMiddleware.js"
import { Router } from "express"


const router = Router();

router.get('/me',authMiddleware,getMe);
router.get('/allUsers',authMiddleware,getAllUser);

export default router;

