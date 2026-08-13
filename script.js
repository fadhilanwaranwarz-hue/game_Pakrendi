const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector(".sidebar");

menuBtn.onclick = () => {
    sidebar.classList.toggle("active");
};

// Tutup sidebar saat klik di luar
document.addEventListener("click", function(e){
    if(
        !sidebar.contains(e.target) &&
        !menuBtn.contains(e.target)
    ){
        sidebar.classList.remove("active");
    }
});