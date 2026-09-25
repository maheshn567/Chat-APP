import api from "./axios.js";

const login = async(data)=>{
    const response = await api.post('/login',data)
    return response
}

const register = async(data)=>{
    const response = await api.post('/register',data)
    return response
}

const getMe = async()=>{
    const response = await api.get('/me')
    return response
}

const getAllUser=async()=>{
    const response = await api.get('/allUsers')
    return response
}

const logOut=async()=>{
    await api.post('/logout')
}

export {login,register,getMe,logOut,getAllUser}

