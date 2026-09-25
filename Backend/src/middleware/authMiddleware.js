import jwt from 'jsonwebtoken';
import getJwtSecret from '../../utilities/jwtSecret.js';

 const authMiddleware = async(req,res,next)=>{
    const token = req.cookies.token || req.cookies.jwt;
    if(!token){
        return res.status(401).json({message:"unauthorized"})
    }
    try {
        const verfiyToken = jwt.verify(token, getJwtSecret());
        req.user = verfiyToken;
        next();
    } catch (error) {
        res.status(401).json({message:"unauthorized",error})
    }
}

export default authMiddleware;
