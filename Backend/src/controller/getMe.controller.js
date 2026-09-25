import prisma from "../../db/index.js";


export default async function getMe(req,res) {
    const userId=req.user.id;
    try{
        const data = await prisma.user.findFirst({
            where:{
                id:userId
            }
        })
        return res.send({success:true,data})
    }
    catch(e){
        console.log("Error while fetching user data",e);
        return res.send({success:false,message:"Error while fetching user data"})
    }
}

export async function getAllUser(req,res) {
    const currentUserId = req.user.id;
    try{
        const data = await prisma.user.findMany();
        
        // Find all private chats involving the current user
        const privateChats = await prisma.chat.findMany({
            where: {
                isGroup: false,
                OR: [
                    { userId: currentUserId },
                    { receiverId: currentUserId }
                ]
            },
            select: {
                userId: true,
                receiverId: true
            }
        });

        // Extract partner user IDs
        const chattedPartnerIds = [];
        privateChats.forEach(chat => {
            if (chat.userId !== currentUserId) {
                chattedPartnerIds.push(chat.userId);
            }
            if (chat.receiverId && chat.receiverId !== currentUserId) {
                chattedPartnerIds.push(chat.receiverId);
            }
        });

        return res.send({
            success: true,
            data,
            chattedUserIds: chattedPartnerIds
        });
    }
    catch(e){
        console.log("Error while fetching user data",e);
        return res.send({success:false,message:"Error while fetching user data"})
    }
}