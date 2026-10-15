// Explicit response shapes prevent selected or populated database fields from leaking.
const publicUser = (user) => ({
    _id: user._id,
    name: user.name,
    userName: user.userName,
    image: user.image,
    bio: user.bio ?? "",
    availability: user.availability ?? "available",
})

export const ownUser = (user) => ({ ...publicUser(user), email: user.email })

export default publicUser
