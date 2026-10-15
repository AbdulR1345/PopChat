// Keep API responses independent of which fields a Mongoose query selected.
const publicUser = (user) => ({
    _id: user._id,
    name: user.name,
    userName: user.userName,
    email: user.email,
    image: user.image,
})

export default publicUser
